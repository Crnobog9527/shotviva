import 'server-only'

import { z } from 'zod'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'
import { localeCoverSchema } from '@/core/templates/cover-locales'
import { isStyleRefKey, styleRefsSchema } from '@/core/templates/style-refs'

export const templateId = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
export const assetColumns = z.object({
  cover_before_url: z.string().nullable(), cover_after_url: z.string().nullable(),
  cover_video_url: z.string().nullable(), cover_poster_url: z.string().nullable(),
  cover_locales: z.record(z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i), localeCoverSchema.strict()),
  style_refs: styleRefsSchema,
})

type Stores = { public: Pick<ObjectStore, 'copy' | 'delete'>; private: Pick<ObjectStore, 'copy' | 'delete'> }
type Copy = { bucket: keyof Stores; from: string; to: string }
const slots = ['before', 'after', 'video', 'poster'] as const
const badAsset = () => new AppError('INVALID_INPUT', '模板含有不属于它的素材，无法复制。')

// Both names are server-owned. Keep the original content-hashed basename so admin downloads,
// reuse-after-cover and immutable public caching continue to work on the copy.
const validPair = (a: string, b: string) => templateId.safeParse(a).success && templateId.safeParse(b).success && a !== b

export function planCopies(source: string, target: string, base: string | undefined, row: unknown) {
  if (!validPair(source, target)) throw badAsset()
  const parsed = assetColumns.safeParse(row)
  if (!parsed.success) throw badAsset()
  const assets = parsed.data
  const copies = new Map<string, Copy>()
  function cover(url: string) {
    const prefix = `${base}/covers/${source}/`
    if (!base || !url.startsWith(prefix)) throw badAsset()
    const name = url.slice(prefix.length)
    if (!/^[a-zA-Z0-9_-]+\.(?:webp|jpg|jpeg|png|mp4|gif)$/.test(name)) throw badAsset()
    const to = `covers/${target}/${name}`
    copies.set(to, { bucket: 'public', from: `covers/${source}/${name}`, to })
    return `${base}/${to}`
  }
  for (const slot of slots) {
    const key = `cover_${slot}_url` as const
    if (assets[key]) assets[key] = cover(assets[key])
    for (const locale of Object.values(assets.cover_locales)) if (locale[slot]) locale[slot] = cover(locale[slot])
  }
  for (const ref of assets.style_refs) {
    if (!isStyleRefKey(source, ref.key)) throw badAsset()
    const to = ref.key.replace(`/${source}/`, `/${target}/`)
    copies.set(to, { bucket: 'private', from: ref.key, to })
    ref.key = to
  }
  return { assets, copies: [...copies.values()] }
}

// Each attempt has a fresh server-generated target namespace. Only clean it when we know
// no transaction committed it. An uncertain database response must never delete live media.
export async function removeCopies(stores: Stores, copies: Copy[]) {
  await Promise.allSettled(copies.map(copy => stores[copy.bucket].delete(copy.to)))
}

export async function executeCopies(stores: Stores, copies: Copy[]) {
  try {
    for (const copy of copies) await stores[copy.bucket].copy(copy.from, copy.to)
  } catch {
    await removeCopies(stores, copies)
    throw new AppError('INTERNAL', 'Template asset copy failed')
  }
}
