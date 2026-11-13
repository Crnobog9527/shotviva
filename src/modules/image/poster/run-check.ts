import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { z } from 'zod'

import { logger } from '@/core/logger'
import { compareReading, partStrings, type PosterDiff } from '@/core/poster'
import { loadPosterPart } from '@/core/poster/sets'
import type { ProviderCredentials } from '@/core/providers'
import { loadOutputImage, type ObjectStore } from '@/core/storage'
import { loadGenerationTemplate } from '@/core/templates'

import { postResponses, readResponsesOutput } from '../edit/openai-responses'

// 自动核对 (ARCHITECTURE §5.3): after a poster job succeeds, the active 'decision' model reads the
// finished poster back, line by line, without seeing what it should say (so it cannot "read" the
// expected text into a blurry line), and the server compares that with the confirmed text. The
// instructions are the template's own, private (model_params.poster_check.instructions). One
// row per job in poster_checks (1316); a failure is 'unchecked', never an error for the user.

export type CheckDeps = {
  db: SupabaseClient
  store: ObjectStore
  credentials: () => Promise<ProviderCredentials | null>
  fetch?: typeof fetch
  timeoutMs?: number
}

export type CheckStatus = 'match' | 'mismatch' | 'unchecked'

// Long enough to read a table row on a 1:3 poster, small enough for one request.
const READ_EDGE = 2048
const TIMEOUT_MS = 60_000
const LINES_SCHEMA = {
  type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } }, required: ['lines'], additionalProperties: false,
} as const

const jobSchema = z.object({
  user_id: z.uuid(), template_id: z.string(), output_key: z.string(), status: z.literal('succeeded'),
  inputs: z.object({ poster: z.object({ set_id: z.uuid(), part: z.number().int().min(0) }) }),
})

async function readJob(db: SupabaseClient, jobId: string) {
  const { data } = await db.from('generation_jobs').select('user_id, template_id, output_key, status, inputs').eq('id', jobId).maybeSingle()
  const parsed = jobSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

const instructionsOf = (modelParams: Record<string, unknown>): string | null => {
  const block = modelParams.poster_check
  const text = block && typeof block === 'object' ? (block as { instructions?: unknown }).instructions : null
  return typeof text === 'string' && text.trim() ? text : null
}

async function posterImage(store: ObjectStore, key: string): Promise<string> {
  const image = await loadOutputImage(store, key)
  const jpeg = await sharp(image.bytes).resize({ width: READ_EDGE, height: READ_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

function requestBody(model: string, instructions: string, imageUrl: string) {
  return {
    model, instructions,
    input: [{ role: 'user', content: [{ type: 'input_image', image_url: imageUrl, detail: 'high' }] }],
    reasoning: { effort: 'none' }, store: false, max_output_tokens: 6000,
    text: { format: { type: 'json_schema', name: 'poster_reading', strict: true, schema: LINES_SCHEMA } },
  }
}

type Usage = { inputTokens: number; outputTokens: number } | null
type Outcome = { status: CheckStatus; diffs: PosterDiff[]; usage: Usage }

const costOf = (usage: Usage, prices: ProviderCredentials['prices']) =>
  usage && prices?.inputTextPerM != null && prices.outputPerM != null
    ? Math.round(usage.inputTokens * prices.inputTextPerM + usage.outputTokens * prices.outputPerM) / 1e6
    : null

async function save(db: SupabaseClient, jobId: string, userId: string, outcome: Outcome, credentials: ProviderCredentials | null) {
  const { error } = await db.from('poster_checks').upsert({
    job_id: jobId, user_id: userId, status: outcome.status, diffs: outcome.diffs, provider: credentials?.tag ?? null,
    input_tokens: outcome.usage?.inputTokens ?? null, output_tokens: outcome.usage?.outputTokens ?? null,
    cost_usd: costOf(outcome.usage, credentials?.prices ?? null),
  }, { onConflict: 'job_id', ignoreDuplicates: true })
  if (error) logger.error('poster.check.save_failed', { jobId, message: error.message })
}

async function read(deps: CheckDeps, credentials: ProviderCredentials, instructions: string, outputKey: string): Promise<{ lines: string[]; usage: Usage }> {
  const body = requestBody(credentials.config.model, instructions, await posterImage(deps.store, outputKey))
  const answer = readResponsesOutput(await postResponses({ ...credentials.config, fetch: deps.fetch }, body, AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS)))
  return { lines: z.object({ lines: z.array(z.string()) }).parse(answer.json).lines, usage: answer.usage }
}

export async function runPosterCheck(deps: CheckDeps, jobId: string): Promise<CheckStatus | null> {
  const job = await readJob(deps.db, jobId)
  if (!job) return null
  const { content, part } = await loadPosterPart(deps.db, job.user_id, { setId: job.inputs.poster.set_id, part: job.inputs.poster.part, templateId: job.template_id })
  const { prompt } = await loadGenerationTemplate(deps.db, job.template_id, 'web')
  const instructions = instructionsOf(prompt.modelParams)
  const credentials = await deps.credentials().catch(() => null)
  if (!instructions || credentials?.adapter !== 'openai_responses') {
    await save(deps.db, jobId, job.user_id, { status: 'unchecked', diffs: [], usage: null }, credentials)
    return 'unchecked'
  }
  try {
    const { lines, usage } = await read(deps, credentials, instructions, job.output_key)
    const diffs = compareReading(partStrings(content, part), lines)
    const status = diffs.length > 0 ? 'mismatch' : 'match'
    await save(deps.db, jobId, job.user_id, { status, diffs, usage }, credentials)
    return status
  } catch (error) {
    logger.warn('poster.check.failed', { jobId, error: error instanceof Error ? error.message : 'unknown' })
    await save(deps.db, jobId, job.user_id, { status: 'unchecked', diffs: [], usage: null }, credentials)
    return 'unchecked'
  }
}
