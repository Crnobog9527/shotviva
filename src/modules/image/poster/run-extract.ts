import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { requireFeature } from '@/core/features'
import { logger } from '@/core/logger'
import { unverifiedPaths, type PosterContent } from '@/core/poster'
import { POSTER_FEATURE, posterFieldsOf } from '@/core/poster/sets'
import type { ProviderCredentials } from '@/core/providers'
import { loadGenerationTemplate } from '@/core/templates'

import { postResponses, readResponsesOutput } from '../edit/openai-responses'
import { EXTRACT_JSON_SCHEMA, toContent } from './extract-schema'

// 整理内容 (ARCHITECTURE §5.3): pasted notice text → the five blocks, by the active 'decision'
// provider with strict structured output. The instructions are the template's own, private
// (template_prompts.model_params.poster_extract.instructions). Every call is recorded with its
// tokens and cost (poster_extractions, 1315); the text itself never is. A failure is not an
// error for the user: the editor then starts empty with the pasted text beside it.

export const EXTRACT_PER_HOUR = 30
export const EXTRACT_TEXT_MAX = 6000
const TIMEOUT_MS = 25_000

export type ExtractDeps = {
  db: SupabaseClient
  credentials: () => Promise<ProviderCredentials | null>
  fetch?: typeof fetch
  now?: () => Date
  timeoutMs?: number
}

export type ExtractResult =
  | { status: 'ok'; content: PosterContent; unverified: string[] }
  | { status: 'unavailable' | 'failed' }

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
    model, instructions,
    input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
    reasoning: { effort: 'none' },
    store: false,
    max_output_tokens: 8000,
    text: { format: { type: 'json_schema', name: 'poster_content', strict: true, schema: EXTRACT_JSON_SCHEMA } },
  }
}

type Usage = { inputTokens: number; outputTokens: number } | null

// Dollars to the micro-dollar, as generation_jobs.cost_usd; null when a price is missing.
function costOf(usage: Usage, prices: ProviderCredentials['prices']): number | null {
  if (!usage || prices?.inputTextPerM == null || prices.outputPerM == null) return null
  return Math.round(usage.inputTokens * prices.inputTextPerM + usage.outputTokens * prices.outputPerM) / 1e6
}

async function record(deps: ExtractDeps, row: { userId: string; chars: number; ok: boolean; provider: string; usage: Usage; prices: ProviderCredentials['prices'] }) {
  const { usage } = row
  const cost = costOf(usage, row.prices)
  const { error } = await deps.db.from('poster_extractions').insert({
    user_id: row.userId, source: 'paste', input_chars: row.chars, status: row.ok ? 'ok' : 'failed', provider: row.provider,
    input_tokens: usage?.inputTokens ?? null, output_tokens: usage?.outputTokens ?? null, cost_usd: cost,
  })
  if (error) logger.error('poster.extract.record_failed', { message: error.message })
}

// One try plus one retry on a transport or shape failure, each under its own deadline.
async function ask(deps: ExtractDeps, credentials: ProviderCredentials, body: unknown) {
  let last: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await postResponses({ ...credentials.config, fetch: deps.fetch }, body, AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS))
      return readResponsesOutput(response)
    } catch (error) {
      last = error
    }
  }
  throw last
}

export async function runExtract(deps: ExtractDeps, input: { userId: string; templateId: string; text: string }): Promise<ExtractResult> {
  await requireFeature(input.userId, POSTER_FEATURE)
  const text = input.text.trim()
  if (!text || text.length > EXTRACT_TEXT_MAX) throw new AppError('INVALID_INPUT', 'Paste between 1 and 6000 characters')
  await assertUnderHourlyLimit(deps.db, input.userId, deps.now?.() ?? new Date())
  const { template, prompt } = await loadGenerationTemplate(deps.db, input.templateId, 'web')
  posterFieldsOf(template.fields)
  const instructions = instructionsOf(prompt.modelParams)
  const credentials = await deps.credentials()
  if (!instructions || !credentials || credentials.adapter !== 'openai_responses') return { status: 'unavailable' }
  const base = { userId: input.userId, chars: text.length, provider: credentials.tag, prices: credentials.prices }
  let usage: Usage = null
  try {
    const answer = await ask(deps, credentials, requestBody(credentials.config.model, instructions, text))
    usage = answer.usage
    const content = toContent(answer.json)
    await record(deps, { ...base, ok: true, usage })
    return { status: 'ok', content, unverified: unverifiedPaths(content, text) }
  } catch (error) {
    logger.warn('poster.extract.failed', { error: error instanceof Error ? error.message : 'unknown' })
    await record(deps, { ...base, ok: false, usage })
    return { status: 'failed' }
  }
}
