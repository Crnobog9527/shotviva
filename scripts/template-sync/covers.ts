import { createHash } from 'node:crypto'

import { z } from 'zod'

import { maxBytesFor, sniffCover } from '../../src/core/admin/covers'
import { ASSETS_CACHE_CONTROL, type ObjectStore } from '../../src/core/storage'
import { localeCoverSchema } from '../../src/core/templates'

export type Assets = { store: Pick<ObjectStore, 'head' | 'get' | 'put'>; base: string }
const localeCovers = z.record(z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/), localeCoverSchema.strict())
const slots = ['before', 'after', 'video', 'poster'] as const
const coverSchema = z.object({
  cover_before_url: z.string().nullable(), cover_after_url: z.string().nullable(),
  cover_video_url: z.string().nullable(), cover_poster_url: z.string().nullable(),
  cover_locales: localeCovers,
})
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4' }

async function copyFile(id: string, url: string, source: Assets, target: Assets) {
  const prefix = source.base + '/'
  const key = url.slice(prefix.length)
  // Never fetch a URL from the source row or let it select a private object.
  if (!url.startsWith(prefix) || !/^covers\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(key)) {
    throw new SyncError('INVALID_COVER_URL')
  }
  const head = await source.store.head(key)
  if (!head || !head.size || head.size > maxBytesFor(head.contentType ?? '')) throw new SyncError('INVALID_COVER_OBJECT')
  const bytes = await source.store.get(key)
  const type = sniffCover(bytes)
  if (!type || bytes.length !== head.size || bytes.length > maxBytesFor(type)) throw new SyncError('INVALID_COVER_OBJECT')
  const digest = createHash('sha256').update(bytes).digest('hex')
  const dest = `covers/${id}/sync-${digest}.${extensions[type]}`
  await target.store.put(dest, bytes, type, { cacheControl: ASSETS_CACHE_CONTROL })
  return `${target.base}/${dest}`
}

export class SyncError extends Error {}

export async function copyCovers(id: string, row: unknown, source: Assets, target: Assets) {
  const parsed = coverSchema.safeParse(row)
  if (!parsed.success) throw new SyncError('INVALID_COVER_OBJECT')
  const result = parsed.data
  const copied = new Map<string, string>()
  async function copy(url: string) {
    const existing = copied.get(url)
    if (existing) return existing
    const dest = await copyFile(id, url, source, target)
    copied.set(url, dest)
    return dest
  }
  for (const slot of slots) {
    const column = `cover_${slot}_url` as const
    if (result[column]) result[column] = await copy(result[column])
  }
  for (const localized of Object.values(result.cover_locales)) {
    for (const slot of slots) {
      if (localized[slot]) localized[slot] = await copy(localized[slot])
    }
  }
  return result
}
