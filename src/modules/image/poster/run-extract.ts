import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { requireFeature } from '@/core/features'
import { logger } from '@/core/logger'
import { POSTER_BLOCKS, parsePosterNotice, unverifiedPaths, type PosterBlock, type PosterContent } from '@/core/poster'
import { POSTER_FEATURE, posterFieldsOf } from '@/core/poster/sets'
import type { ProviderCredentials } from '@/core/providers'
import { loadGenerationTemplate } from '@/core/templates'

import { EXTRACT_FORMAT_NOTE, EXTRACT_JSON_SCHEMA, toContent } from './extract-schema'
import { streamResponses, type StreamUsage } from './stream-responses'

// 整理内容 (ARCHITECTURE §5.3): pasted notice text → the five blocks. A notice already laid out
// the usual way is sorted on the spot by parsePosterNotice; anything else goes to the active
// 'decision' provider with strict structured output, streamed so the editor can show which block
// is being written. The model's instructions are the template's own, private
// (template_prompts.model_params.poster_extract.instructions). Every call is recorded with its
// tokens and cost (poster_extractions, 1345; the parser's rows have provider 'parser' and cost 0);
// the text itself never is. A failure is not an error for the user: the editor then starts empty
// with the pasted text beside it.

export const EXTRACT_PER_HOUR = 30
export const EXTRACT_TEXT_MAX = 6000
const TIMEOUT_MS = 25_000
export const PARSER_PROVIDER = 'parser'

export type ExtractDeps = {
  db: SupabaseClient
  credentials: () => Promise<ProviderCredentials | null>
  fetch?: typeof fetch
  now?: () => Date
  timeoutMs?: number
}

export type ExtractResult =
  | { status: 'ok'; content: PosterContent; unverified: string[]; clipped: string[] }
  | { status: 'unavailable' | 'failed' }

// The block the model is writing (the answer's keys come in POSTER_BLOCKS order); the editor
// shows them as progress steps.
export type ExtractStage = PosterBlock

// What the route does next: answer at once, or stream the model's progress then its answer.
export type PreparedExtract =
  | { kind: 'done'; result: ExtractResult }
  | { kind: 'model'; run: (onStage: (stage: ExtractStage) => void) => Promise<ExtractResult> }

async function assertUnderHourlyLimit(db: SupabaseClient, userId: string, now: Date) {
  const since = new Date(now.getTime() - 3600 * 1000).toISOString()
  const { data, error } = await db.from('poster_extractions').select('id')
    .eq('user_id', userId).gte('created_at', since).limit(EXTRACT_PER_HOUR)
  if (error) throw new AppError('INTERNAL', 'poster_extractions count failed', { cause: new Error(error.message) })
  if ((data?.length ?? 0) >= EXTRACT_PER_HOUR) throw new AppError('RATE_LIMITED', 'Too many requests, try again later')
}

function instructionsOf(modelParams: Record<string, unknown>): string | null {
  const block = modelParams.poster_extract
  const text = block && typeof block === 'object' ? (block as { instructions?: unknown }).instructions : null
  return typeof text === 'string' && text.trim() ? text : null
}

function requestBody(model: string, instructions: string, text: string) {
  return {
    model, instructions: `${instructions}\n\n${EXTRACT_FORMAT_NOTE}`,
    input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
    reasoning: { effort: 'none' },
    store: false,
    stream: true,
    max_output_tokens: 8000,
    text: { format: { type: 'json_schema', name: 'poster_content', strict: true, schema: EXTRACT_JSON_SCHEMA } },
  }
}

// Dollars to the micro-dollar, as generation_jobs.cost_usd; null when a price is missing.
function costOf(usage: StreamUsage, prices: ProviderCredentials['prices']): number | null {
  if (!usage || prices?.inputTextPerM == null || prices.outputPerM == null) return null
  return Math.round(usage.inputTokens * prices.inputTextPerM + usage.outputTokens * prices.outputPerM) / 1e6
}

// The call's row goes in before the model is asked, so concurrent calls all count against the
// hourly limit; it is completed (status, tokens, cost) when the call ends. The parser's row is
// written complete.
async function insertRow(deps: ExtractDeps, userId: string, chars: number, provider: string, done = false): Promise<number> {
  const row = { user_id: userId, source: 'paste', input_chars: chars, provider, ...(done ? { status: 'ok', cost_usd: 0 } : { status: 'pending' }) }
  const { data, error } = await deps.db.from('poster_extractions').insert(row).select('id').single<{ id: number }>()
  if (error) throw new AppError('INTERNAL', 'poster_extractions insert failed', { cause: new Error(error.message) })
  return data.id
}

async function record(deps: ExtractDeps, id: number, row: { ok: boolean; usage: StreamUsage; prices: ProviderCredentials['prices'] }) {
  const { usage } = row
  const { error } = await deps.db.from('poster_extractions').update({
    status: row.ok ? 'ok' : 'failed', input_tokens: usage?.inputTokens ?? null, output_tokens: usage?.outputTokens ?? null,
    cost_usd: costOf(usage, row.prices),
  }).eq('id', id)
  if (error) logger.error('poster.extract.record_failed', { message: error.message })
}

// A stage starts when its key first appears in the streamed JSON ("info" sits with sections);
// each stage is reported once, in order, even when a retry writes the answer again.
export function stageWatcher(onStage: (stage: ExtractStage) => void) {
  let reached = 0
  let text = ''
  return (delta: string) => {
    text += delta
    let index = POSTER_BLOCKS.length - 1
    while (index >= reached && !text.includes(`"${POSTER_BLOCKS[index]}"`)) index -= 1
    for (; reached <= index; reached += 1) onStage(POSTER_BLOCKS[reached]!)
  }
}

// One try plus one retry on a transport or shape failure, each under its own deadline.
async function ask(deps: ExtractDeps, credentials: ProviderCredentials, body: unknown, onStage: (stage: ExtractStage) => void) {
  let last: unknown
  const watch = stageWatcher(onStage)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS)
      const answer = await streamResponses({ ...credentials.config, fetch: deps.fetch }, body, signal, watch)
      return { ...answer, ...toContent(answer.json) }
    } catch (error) {
      last = error
    }
  }
  throw last
}

function okResult(content: PosterContent, clipped: string[], text: string): ExtractResult {
  // A cut value is still found in the paste, so it is flagged for review explicitly.
  const unverified = [...new Set([...unverifiedPaths(content, text), ...clipped])]
  return { status: 'ok', content, unverified, clipped }
}

// Checks, then the parser; the model call is handed back for the caller to run (and stream).
export async function prepareExtract(deps: ExtractDeps, input: { userId: string; templateId: string; text: string }): Promise<PreparedExtract> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  await requireFeature(input.userId, POSTER_FEATURE)
  const text = input.text.trim()
  if (!text || text.length > EXTRACT_TEXT_MAX) throw new AppError('INVALID_INPUT', 'Paste between 1 and 6000 characters')
  await assertUnderHourlyLimit(deps.db, input.userId, deps.now?.() ?? new Date())
  const { template, prompt } = await loadGenerationTemplate(deps.db, input.templateId, 'web')
  posterFieldsOf(template.fields)
  const parsed = parsePosterNotice(text)
  if (parsed) {
    await insertRow(deps, input.userId, text.length, PARSER_PROVIDER, true)
    logger.info('poster.extract.done', { source: PARSER_PROVIDER, chars: text.length, ms: elapsed() })
    return { kind: 'done', result: okResult(parsed, [], text) }
  }
  const instructions = instructionsOf(prompt.modelParams)
  const credentials = await deps.credentials()
  if (!instructions || !credentials || credentials.adapter !== 'openai_responses') return { kind: 'done', result: { status: 'unavailable' } }
  const id = await insertRow(deps, input.userId, text.length, credentials.tag)
  const run = async (onStage: (stage: ExtractStage) => void): Promise<ExtractResult> => {
    let usage: StreamUsage = null
    try {
      const answer = await ask(deps, credentials, requestBody(credentials.config.model, instructions, text), onStage)
      usage = answer.usage
      await record(deps, id, { ok: true, usage, prices: credentials.prices })
      logger.info('poster.extract.done', { source: 'model', chars: text.length, ms: elapsed(), firstTokenMs: answer.firstTokenMs, outputTokens: usage?.outputTokens ?? null })
      return okResult(answer.content, answer.clipped, text)
    } catch (error) {
      logger.warn('poster.extract.failed', { error: error instanceof Error ? error.message : 'unknown', ms: elapsed() })
      await record(deps, id, { ok: false, usage, prices: credentials.prices })
      return { status: 'failed' }
    }
  }
  return { kind: 'model', run }
}

// The whole call in one go, without progress.
export async function runExtract(deps: ExtractDeps, input: { userId: string; templateId: string; text: string }): Promise<ExtractResult> {
  const prepared = await prepareExtract(deps, input)
  return prepared.kind === 'done' ? prepared.result : prepared.run(() => undefined)
}
