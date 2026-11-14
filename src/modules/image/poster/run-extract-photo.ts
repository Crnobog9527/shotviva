import 'server-only'

import sharp from 'sharp'
import { z } from 'zod'

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
import { ask, assertUnderHourlyLimit, costOf, EXTRACT_TEXT_MAX, instructionsOf, okResult, PARSER_PROVIDER, requestBody, type ExtractDeps, type ExtractResult, type ExtractStage } from './run-extract'
import type { StreamUsage } from './stream-responses'

// 拍照识别 (ARCHITECTURE §5.3「每周复用」): a photo or screenshot of an old poster → the same blocks
// as a paste. A vision step in front of 整理内容: the active 'decision' model (OpenAI's official
// API, openai_responses) transcribes the poster line by line with the template's own reading
// instructions (model_params.poster_check.instructions, the ones 自动核对 uses), then the lines
// go through the paste pipeline: the local parser, else the model with streamed progress. One
// poster_extractions row per photo (source 'photo') carries both calls' tokens and cost, and
// counts against the same 30-an-hour limit.

export type PhotoDeps = ExtractDeps & { store: () => ObjectStore }
export type PhotoResult = ExtractResult & { text?: string }
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

type Call = { deps: PhotoDeps; credentials: ProviderCredentials; userId: string; id: number }

async function insertPending(deps: PhotoDeps, userId: string, provider: string): Promise<number> {
  const { data, error } = await deps.db.from('poster_extractions').insert({ user_id: userId, source: 'photo', input_chars: 0, provider, status: 'pending' }).select('id').single<{ id: number }>()
  if (error) throw new AppError('INTERNAL', 'poster_extractions insert failed', { cause: new Error(error.message) })
  return data.id
}

async function record(call: Call, row: { ok: boolean; usage: StreamUsage; chars: number; provider?: string }) {
  const { usage } = row
  const { error } = await call.deps.db.from('poster_extractions').update({
    status: row.ok ? 'ok' : 'failed', input_chars: row.chars, input_tokens: usage?.inputTokens ?? null, output_tokens: usage?.outputTokens ?? null,
    cost_usd: costOf(usage, call.credentials.prices), ...(row.provider ? { provider: row.provider } : {}),
  }).eq('id', call.id)
  if (error) logger.error('poster.extract.record_failed', { message: error.message })
}

// The poster's lines, top to bottom, as one notice (at most what a paste may hold).
async function transcribe(call: Call, instructions: string, key: string, spent: { usage: StreamUsage }): Promise<string> {
  const body = readingBody(call.credentials.config.model, instructions, await photoUrl(call.deps.store(), key))
  const answer = readResponsesOutput(await postResponses({ ...call.credentials.config, fetch: call.deps.fetch }, body, AbortSignal.timeout(READ_TIMEOUT_MS)))
  spent.usage = answer.usage
  const lines = z.object({ lines: z.array(z.string()) }).parse(answer.json).lines
  // Blank lines stay (one at most): they split the notice into the paragraphs the parser reads.
  return lines.map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, EXTRACT_TEXT_MAX)
}

async function runPhoto(call: Call, prompts: { read: string; sort: string }, key: string, onStage: (stage: ExtractStage) => void): Promise<PhotoResult> {
  const started = performance.now()
  const spent: { usage: StreamUsage } = { usage: null }
  let chars = 0
  try {
    const text = await transcribe(call, prompts.read, key, spent)
    chars = text.length
    if (!text) throw new Error('no text on the photo')
    const parsed = parsePosterNotice(text)
    if (parsed) {
      await record(call, { ok: true, usage: spent.usage, chars })
      logger.info('poster.extract.done', { source: 'photo', sorter: PARSER_PROVIDER, chars, ms: Math.round(performance.now() - started) })
      return { ...okResult(parsed, [], text), text }
    }
    const answer = await ask(call.deps, call.credentials, requestBody(call.credentials.config.model, prompts.sort, text), onStage)
    spent.usage = add(spent.usage, answer.usage)
    await record(call, { ok: true, usage: spent.usage, chars })
    logger.info('poster.extract.done', { source: 'photo', sorter: 'model', chars, ms: Math.round(performance.now() - started), outputTokens: spent.usage?.outputTokens ?? null })
    return { ...okResult(answer.content, answer.clipped, text), text }
  } catch (error) {
    logger.warn('poster.extract.failed', { source: 'photo', error: error instanceof Error ? error.message : 'unknown' })
    await record(call, { ok: false, usage: spent.usage, chars })
    return { status: 'failed' }
  }
}

export async function preparePhotoExtract(deps: PhotoDeps, input: { userId: string; templateId: string; inputKey: string }): Promise<PreparedPhoto> {
  await requireFeature(input.userId, POSTER_FEATURE)
  if (!isOwnInputKey(input.userId, input.inputKey)) throw new AppError('INVALID_INPUT', 'Unknown upload')
  await assertUnderHourlyLimit(deps.db, input.userId, deps.now?.() ?? new Date())
  const { template, prompt } = await loadGenerationTemplate(deps.db, input.templateId, 'web')
  posterFieldsOf(template.fields)
  const read = checkInstructionsOf(prompt.modelParams)
  const sort = instructionsOf(prompt.modelParams)
  const credentials = await deps.credentials()
  if (!read || !sort || !credentials || credentials.adapter !== 'openai_responses') return { kind: 'done', result: { status: 'unavailable' } }
  const call: Call = { deps, credentials, userId: input.userId, id: await insertPending(deps, input.userId, credentials.tag) }
  return { kind: 'model', run: (onStage) => runPhoto(call, { read, sort }, input.inputKey, onStage) }
}
