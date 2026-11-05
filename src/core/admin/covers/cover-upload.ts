import 'server-only'

import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'

import { animatedCover, sniffCover, stillCover, videoCover, type CoverFile } from './cover-media'
import { allowedTypes, COVER_PURPOSES, COVER_UPLOAD_TTL_SECONDS, coverFileProblem, maxBytesFor } from './cover-rules'

// Admin cover upload (ARCHITECTURE §8.3). Bytes never pass a function body: the browser PUTs
// to the private bucket's uploads-admin/ prefix (7-day lifecycle), then applyCover reads the
// object, converts it, writes covers/{template_id}/… to the public bucket and points the
// template row at the new public URL. Callers have passed requireAdmin().

export type CoverDeps = {
  db: SupabaseClient
  // Private bucket (uploads-admin/ staging) and public assets bucket (covers/ only).
  uploads: ObjectStore
  assets: ObjectStore
  assetsBaseUrl: string | undefined
}

const templateId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64)
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4' }

const uploadRequestSchema = z.object({
  templateId,
  purpose: z.enum(COVER_PURPOSES),
  contentType: z.string(),
  size: z.number().int().positive(),
})

export type CoverUploadTicket = { key: string; putUrl: string; headers: { 'Content-Type': string } }

export async function createCoverUpload(uploads: ObjectStore, input: unknown): Promise<CoverUploadTicket> {
  const parsed = uploadRequestSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '上传参数不对')
  const { purpose, contentType, size } = parsed.data
  const problem = coverFileProblem(purpose, { type: contentType, size })
  if (problem) throw new AppError('INVALID_INPUT', problem)
  const key = `uploads-admin/${parsed.data.templateId}/${randomUUID()}.${EXT[contentType]}`
  const putUrl = await uploads.presignPut(key, contentType, COVER_UPLOAD_TTL_SECONDS)
  return { key, putUrl, headers: { 'Content-Type': contentType } }
}

const stagedKey = (id: string) => z.string().regex(new RegExp(`^uploads-admin/${id}/[0-9a-f-]{36}\\.(jpg|png|webp|gif|mp4)$`))

const applySchema = z.discriminatedUnion('slot', [
  z.object({ templateId, slot: z.enum(['before', 'after']), key: z.string() }),
  z.object({ templateId, slot: z.literal('motion'), key: z.string(), posterKey: z.string().optional() }),
  z.object({ templateId, slot: z.literal('clear-motion') }),
])

export type ApplyCoverInput = z.input<typeof applySchema>

// The stored object, re-checked: HEAD size, then the bytes' real type against what the slot takes.
async function readStaged(uploads: ObjectStore, id: string, key: string, accepts: readonly string[]) {
  if (!stagedKey(id).safeParse(key).success) throw new AppError('INVALID_INPUT', '上传的文件不属于这个模板')
  const head = await uploads.head(key)
  if (!head) throw new AppError('INVALID_INPUT', '没找到上传的文件，请重新上传')
  const bytes = await uploads.get(key)
  const type = sniffCover(bytes)
  if (!type || !accepts.includes(type)) throw new AppError('INVALID_INPUT', '文件类型不对')
  if (bytes.length > maxBytesFor(type)) throw new AppError('INVALID_INPUT', '文件太大')
  return { bytes, type }
}

type Plan = { files: { name: string; file: CoverFile }[]; row: (url: (name: string) => string) => Record<string, unknown> }

async function planMotion(deps: CoverDeps, id: string, key: string, posterKey: string | undefined): Promise<Plan> {
  const { bytes, type } = await readStaged(deps.uploads, id, key, allowedTypes('motion'))
  if (type !== 'video/mp4') {
    const { motion, poster } = await animatedCover(bytes)
    return {
      files: [{ name: 'motion', file: motion }, { name: 'poster', file: poster }],
      row: (url) => ({ cover_media_type: 'animated', cover_video_url: url('motion'), cover_poster_url: url('poster') }),
    }
  }
  if (!posterKey) throw new AppError('INVALID_INPUT', '视频需要一张封面帧')
  const motion = videoCover(bytes)
  const poster = await stillCover((await readStaged(deps.uploads, id, posterKey, allowedTypes('poster'))).bytes)
  return {
    files: [{ name: 'motion', file: motion }, { name: 'poster', file: poster }],
    row: (url) => ({ cover_media_type: 'video', cover_video_url: url('motion'), cover_poster_url: url('poster') }),
  }
}

async function plan(deps: CoverDeps, input: z.infer<typeof applySchema>): Promise<Plan> {
  if (input.slot === 'clear-motion') {
    return { files: [], row: () => ({ cover_media_type: 'image', cover_video_url: null, cover_poster_url: null }) }
  }
  if (input.slot === 'motion') return planMotion(deps, input.templateId, input.key, input.posterKey)
  const { bytes } = await readStaged(deps.uploads, input.templateId, input.key, allowedTypes(input.slot))
  const column = input.slot === 'before' ? 'cover_before_url' : 'cover_after_url'
  return { files: [{ name: input.slot, file: await stillCover(bytes) }], row: (url) => ({ [column]: url(input.slot) }) }
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

// Converts and publishes one cover, then points the template at it. Content-hashed names mean a
// new upload is a new URL, so nothing needs purging; old files stay (a few hundred KB each).
export async function applyCover(deps: CoverDeps, input: ApplyCoverInput): Promise<void> {
  const parsed = applySchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '上传参数不对')
  if (!deps.assetsBaseUrl) throw new AppError('INTERNAL', 'NEXT_PUBLIC_ASSETS_BASE_URL is not configured')
  const id = parsed.data.templateId
  const { files, row } = await plan(deps, parsed.data)
  const keys = new Map(files.map(({ name, file }) => [name, `covers/${id}/${name}-${file.hash}.${file.ext}`]))
  for (const { name, file } of files) {
    await deps.assets.put(keys.get(name) as string, file.bytes, file.contentType, { cacheControl: IMMUTABLE })
  }
  const { data, error } = await deps.db
    .from('templates')
    .update(row((name) => `${deps.assetsBaseUrl}/${keys.get(name)}`))
    .eq('id', id)
    .select('id')
  if (error) throw new AppError('INTERNAL', `cover update failed: ${error.message}`)
  if (data.length === 0) throw new AppError('NOT_FOUND', `template ${id} not found`)
  await removeStaged(deps.uploads, parsed.data)
}

// The staging copies are done with; the 7-day lifecycle would catch any we miss.
async function removeStaged(uploads: ObjectStore, input: z.infer<typeof applySchema>) {
  const keys = input.slot === 'clear-motion' ? [] : [input.key, input.slot === 'motion' ? input.posterKey : undefined]
  for (const key of keys) {
    if (key) await uploads.delete(key).catch((error: unknown) => logger.warn('staged cover not deleted', { key, error }))
  }
}
