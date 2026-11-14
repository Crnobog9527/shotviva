import 'server-only'

import sharp from 'sharp'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import { requireFeature } from '@/core/features'
import { logger } from '@/core/logger'
import { parsePosterNotice } from '@/core/poster'
import { POSTER_FEATURE, posterFieldsOf } from '@/core/poster/sets'
import type { ProviderCredentials } from '@/core/providers'
import { isOwnInputKey, loadInputImage, type ObjectStore } from '@/core/storage'
import { loadGenerationTemplate } from '@/core/templates'

import { postResponses, readResponsesOutput } from '../edit/openai-responses'
import { checkInstructionsOf, READ_EDGE, readingBody } from './run-check'
import { ask, costOf, EXTRACT_PER_HOUR, EXTRACT_TEXT_MAX, instructionsOf, okResult, PARSER_PROVIDER, requestBody, type ExtractDeps, type ExtractResult, type ExtractStage } from './run-extract'
import type { StreamUsage } from './stream-responses'

// 拍照识别 (ARCHITECTURE §5.3「每周复用」): a photo or screenshot of an old poster → the same blocks
// as a paste. A vision step in front of 整理内容: the active 'decision' model (OpenAI's official
// API, openai_responses) transcribes the poster line by line with the template's own reading
// instructions (model_params.poster_check.instructions, the ones 自动核对 uses), then the lines
// go through the paste pipeline: the local parser, else the model with streamed progress. One
// poster_extractions row per run (source 'photo') carries the calls' tokens and cost, and counts
// against the same 30-an-hour limit. Each run is charged (price: system setting
// poster_photo_credits, 1521/1523) before any call; a failed or unreadable run is refunded.

export type PhotoDeps = ExtractDeps & { store: () => ObjectStore }
// credits: what the run took (an ok run keeps it); a failed run says it was refunded.
export type PhotoResult = (ExtractResult & { text?: string; credits?: number }) | { status: 'failed'; refunded: number }
export type PreparedPhoto = { kind: 'done'; result: PhotoResult } | { kind: 'model'; run: (onStage: (stage: ExtractStage) => void) => Promise<PhotoResult> }

const READ_TIMEOUT_MS = 45_000
function add(a: StreamUsage, b: StreamUsage): StreamUsage {
  if (!a || !b) return a ?? b
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }
}

async function photoUrl(store: ObjectStore, key: string): Promise<string> {
  const image = await loadInputImage(store, key)
  const jpeg = await sharp(image.bytes).rotate().resize({ width: READ_EDGE, height: READ_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

type Call = { deps: PhotoDeps; credentials: ProviderCredentials; userId: string; id: number; credits: number }

const startSchema = z.array(z.object({ extraction_id: z.number(), credits: z.number().int() })).length(1)

// The run's row and its debit, in one call (1523): the price, the hourly limit and the pool are
// the database's. No price saved yet: the feature is off, nothing charged.
async function start(deps: PhotoDeps, userId: string, provider: string): Promise<{ id: number; credits: number } | null> {
  try {
    const [row] = await callRpc(deps.db, 'start_poster_photo', { p_user_id: userId, p_provider: provider, p_per_hour: EXTRACT_PER_HOUR }, startSchema)
    return { id: row!.extraction_id, credits: row!.credits }
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND' && error.message === 'PRICE_UNSET') return null
    throw error
  }
}

const tokens = (usage: StreamUsage) => ({ input: usage?.inputTokens ?? null, output: usage?.outputTokens ?? null })

// An ok run: its usage. A failed one: refunded (1523) with its usage, never left charged.
async function record(call: Call, row: { ok: boolean; usage: StreamUsage; chars: number }) {
  const used = tokens(row.usage)
  const cost = costOf(row.usage, call.credentials.prices)
  if (!row.ok) {
    await callRpc(call.deps.db, 'refund_poster_photo', {
      p_extraction_id: call.id, p_input_chars: row.chars, p_input_tokens: used.input, p_output_tokens: used.output, p_cost_usd: cost,
    }, z.unknown()).catch((error: unknown) => logger.error('poster.photo.refund_failed', { id: call.id, error }))
    return
  }
  const { error } = await call.deps.db.from('poster_extractions').update({
    status: 'ok', input_chars: row.chars, input_tokens: used.input, output_tokens: used.output, cost_usd: cost,
  }).eq('id', call.id).eq('status', 'pending')
  if (error) logger.error('poster.extract.record_failed', { message: error.message })
}

// One photo's lines, top to bottom. Blank lines stay (one at most): they split the notice into
// the paragraphs the parser reads.
async function readPhoto(call: Call, instructions: string, key: string, spent: { usage: StreamUsage }): Promise<string> {
  const body = readingBody(call.credentials.config.model, instructions, await photoUrl(call.deps.store(), key))
  const answer = readResponsesOutput(await postResponses({ ...call.credentials.config, fetch: call.deps.fetch }, body, AbortSignal.timeout(READ_TIMEOUT_MS)))
  spent.usage = add(spent.usage, answer.usage)
  const lines = z.object({ lines: z.array(z.string()) }).parse(answer.json).lines
  return lines.map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Every page's photo, read at once, as one notice (at most what a paste may hold).
async function transcribe(call: Call, instructions: string, keys: readonly string[], spent: { usage: StreamUsage }): Promise<string> {
  const pages = await Promise.all(keys.map((key) => readPhoto(call, instructions, key, spent)))
  return pages.filter(Boolean).join('\n\n').slice(0, EXTRACT_TEXT_MAX)
}

async function runPhoto(call: Call, prompts: { read: string; sort: string }, keys: readonly string[], onStage: (stage: ExtractStage) => void): Promise<PhotoResult> {
  const started = performance.now()
  const spent: { usage: StreamUsage } = { usage: null }
  let chars = 0
  try {
    const text = await transcribe(call, prompts.read, keys, spent)
    chars = text.length
    if (!text) throw new Error('no text on the photo')
    const parsed = parsePosterNotice(text)
    if (parsed) {
      await record(call, { ok: true, usage: spent.usage, chars })
      logger.info('poster.extract.done', { source: 'photo', sorter: PARSER_PROVIDER, chars, ms: Math.round(performance.now() - started) })
      return { ...okResult(parsed, [], text), text, credits: call.credits }
    }
    const answer = await ask(call.deps, call.credentials, requestBody(call.credentials.config.model, prompts.sort, text), onStage)
    spent.usage = add(spent.usage, answer.usage)
    await record(call, { ok: true, usage: spent.usage, chars })
    logger.info('poster.extract.done', { source: 'photo', sorter: 'model', chars, ms: Math.round(performance.now() - started), outputTokens: spent.usage?.outputTokens ?? null })
    return { ...okResult(answer.content, answer.clipped, text), text, credits: call.credits }
  } catch (error) {
    logger.warn('poster.extract.failed', { source: 'photo', error: error instanceof Error ? error.message : 'unknown' })
    await record(call, { ok: false, usage: spent.usage, chars })
    return { status: 'failed', refunded: call.credits }
  }
}

// Up to this many photos in one go: a set's pages (at most 4), one photo each.
export const PHOTOS_MAX = 4

export async function preparePhotoExtract(deps: PhotoDeps, input: { userId: string; templateId: string; inputKeys: readonly string[] }): Promise<PreparedPhoto> {
  await requireFeature(input.userId, POSTER_FEATURE)
  const keys = [...new Set(input.inputKeys)]
  if (keys.length === 0 || keys.length > PHOTOS_MAX || keys.some((key) => !isOwnInputKey(input.userId, key))) throw new AppError('INVALID_INPUT', 'Unknown upload')
  const { template, prompt } = await loadGenerationTemplate(deps.db, input.templateId, 'web')
  posterFieldsOf(template.fields)
  const read = checkInstructionsOf(prompt.modelParams)
  const sort = instructionsOf(prompt.modelParams)
  const credentials = await deps.credentials()
  if (!read || !sort || !credentials || credentials.adapter !== 'openai_responses') return { kind: 'done', result: { status: 'unavailable' } }
  const started = await start(deps, input.userId, credentials.tag)
  if (!started) return { kind: 'done', result: { status: 'unavailable' } }
  const call: Call = { deps, credentials, userId: input.userId, ...started }
  return { kind: 'model', run: (onStage) => runPhoto(call, { read, sort }, keys, onStage) }
}
