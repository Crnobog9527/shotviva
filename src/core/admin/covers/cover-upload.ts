import 'server-only'

import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { LOCALES } from '@/core/i18n/locales'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'

import { animatedCover, sniffCover, stillCover, videoCover, type CoverFile } from './cover-media'
import { IMMUTABLE } from './cover-publish'
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
  // Who uploads; needed for a language's cover (admin_set_template_locale_cover checks it, T87).
  actorId?: string
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

// null / absent: the common cover; a code: that language's own cover (ARCHITECTURE §8.3, T87).
const locale = z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/).nullable().optional()

const applySchema = z.discriminatedUnion('slot', [
  z.object({ templateId, locale, slot: z.enum(['before', 'after']), key: z.string() }),
  z.object({ templateId, locale, slot: z.literal('motion'), key: z.string(), posterKey: z.string().optional() }),
  z.object({ templateId, locale, slot: z.literal('clear-motion') }),
  // A language tab's 「删除这个语言的封面」: its own cover goes, the page falls back (T87).
  z.object({ templateId, locale: z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/), slot: z.literal('clear-locale') }),
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
  if (input.slot === 'clear-locale') return { files: [], row: () => ({}) }
  if (input.slot === 'clear-motion') {
    return { files: [], row: () => ({ cover_media_type: 'image', cover_video_url: null, cover_poster_url: null }) }
  }
  if (input.slot === 'motion') return planMotion(deps, input.templateId, input.key, input.posterKey)
  const { bytes } = await readStaged(deps.uploads, input.templateId, input.key, allowedTypes(input.slot))
  const column = input.slot === 'before' ? 'cover_before_url' : 'cover_after_url'
  return { files: [{ name: input.slot, file: await stillCover(bytes) }], row: (url) => ({ [column]: url(input.slot) }) }
}


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
  const columns = row((name) => `${deps.assetsBaseUrl}/${keys.get(name)}`)
  if (parsed.data.locale) await writeLocaleCover(deps, parsed.data, columns)
  else await writeCommonCover(deps.db, id, columns)
  await removeStaged(deps.uploads, parsed.data)
}

async function writeCommonCover(db: SupabaseClient, id: string, columns: Record<string, unknown>) {
  const { data, error } = await db.from('templates').update(columns).eq('id', id).select('id')
  if (error) throw new AppError('INTERNAL', `cover update failed: ${error.message}`)
  if (data.length === 0) throw new AppError('NOT_FOUND', `template ${id} not found`)
}

// The common cover's column names → a language cover's keys (templates.cover_locales, 0820). A
// static card type there means "no motion of its own".
const LOCALE_KEY: Record<string, string> = {
  cover_before_url: 'before',
  cover_after_url: 'after',
  cover_video_url: 'video',
  cover_poster_url: 'poster',
  cover_media_type: 'media',
}

export function localePatch(columns: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(columns).map(([column, value]) => [LOCALE_KEY[column] ?? column, column === 'cover_media_type' && value === 'image' ? null : value]),
  )
}

// One language's cover through admin_set_template_locale_cover (0824): merged, never overwritten.
async function writeLocaleCover(deps: CoverDeps, input: z.infer<typeof applySchema>, columns: Record<string, unknown>) {
  if (!deps.actorId) throw new AppError('INTERNAL', 'a language cover needs the admin id')
  const { error } = await deps.db.rpc('admin_set_template_locale_cover', {
    p_actor: deps.actorId,
    p_template_id: input.templateId,
    p_locale: input.locale,
    p_patch: localePatch(columns),
    // Only our public assets origin is accepted; the launched languages decide what a live
    // template may not lose (0824).
    p_assets_base: deps.assetsBaseUrl,
    p_locales: LOCALES,
    p_clear: input.slot === 'clear-locale',
  })
  if (!error) return
  if (error.message === 'TEMPLATE_NOT_FOUND') throw new AppError('NOT_FOUND', `template ${input.templateId} not found`)
  if (error.message === 'COVER_STILL_NEEDED') {
    throw new AppError('INVALID_INPUT', '这个模板已上架，删掉后就没有前图或后图可显示了。先给通用或其他已上线语言传好封面，或先下架再删。')
  }
  throw new AppError('INTERNAL', `language cover update failed: ${error.message}`)
}

// The staging copies are done with; the 7-day lifecycle would catch any we miss.
async function removeStaged(uploads: ObjectStore, input: z.infer<typeof applySchema>) {
  const keys = input.slot === 'clear-motion' || input.slot === 'clear-locale' ? [] : [input.key, input.slot === 'motion' ? input.posterKey : undefined]
  for (const key of keys) {
    if (key) await uploads.delete(key).catch((error: unknown) => logger.warn('staged cover not deleted', { key, error }))
  }
}
