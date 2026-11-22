import 'server-only'

import sharp from 'sharp'

import { ASSETS_CACHE_CONTROL } from './assets-env'
import type { ObjectStore } from './object-store'
import { isPresizableCoverKey, PRESIZED_QUALITY, PRESIZED_WIDTHS, presizedPaths, presizedPath } from '../presized'

// The fixed-width WebP copies of a template cover (core/presized), written next to it in the
// public bucket under presized/v1/w{width}/{cover key}. Pages load them instead of /_next/image
// once NEXT_PUBLIC_PRESIZED_IMAGES_URL is on, so every cover must have them before it is shown:
// the public bucket's store writes them with the cover itself (withPresizedCopies below), and
// scripts/presize-covers fills in the covers published before this existed.

const MAX_INPUT_PIXELS = 120_000_000

export type PresizedCopy = { width: number; bytes: Uint8Array }

// /_next/image's WebP encoding (q75 at that width, never enlarged), so a copy is the bytes a WebP
// browser got before. Widths past the picture's own are the same file: encoded once.
export async function presizedCopies(source: Uint8Array | string): Promise<PresizedCopy[]> {
  const { width: own = Number.POSITIVE_INFINITY } = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  const copies: PresizedCopy[] = []
  let full: Uint8Array | null = null
  for (const width of PRESIZED_WIDTHS) {
    const capped = width >= own
    const bytes: Uint8Array = capped && full ? full : await encodePresized(source, width)
    if (capped) full = bytes
    copies.push({ width, bytes })
  }
  return copies
}

export async function encodePresized(source: Uint8Array | string, width: number): Promise<Uint8Array> {
  const out = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: PRESIZED_QUALITY })
    .toBuffer()
  return new Uint8Array(out)
}

type Writes = Pick<ObjectStore, 'put'>

// All copies of one cover. Throws when one cannot be made or written, so the caller does not point
// a template at a cover whose copies are missing.
export async function writePresizedCopies(store: Writes, key: string, bytes: Uint8Array): Promise<number> {
  const copies = await presizedCopies(bytes)
  for (const copy of copies) {
    await store.put(presizedPath(key, copy.width), copy.bytes, 'image/webp', { cacheControl: ASSETS_CACHE_CONTROL })
  }
  return copies.length
}

// Whether every copy of a cover is already in the bucket (the backfill's skip test).
export async function hasPresizedCopies(store: Pick<ObjectStore, 'head'>, key: string): Promise<boolean> {
  for (const path of presizedPaths(key)) if (!(await store.head(path))) return false
  return true
}

// Copies follow the cover through a server-side copy (「复制模板」 keeps the basename under the new
// template): copied when the source has them, made from the copied cover otherwise.
async function copyPresized(store: ObjectStore, sourceKey: string, destinationKey: string) {
  if (isPresizableCoverKey(sourceKey) && (await hasPresizedCopies(store, sourceKey))) {
    for (const width of PRESIZED_WIDTHS) await store.copy(presizedPath(sourceKey, width), presizedPath(destinationKey, width))
    return
  }
  await writePresizedCopies(store, destinationKey, await store.get(destinationKey))
}

// The public bucket's store with the copies kept beside every pre-sizable cover: written before
// the cover (a failure leaves no cover without them), copied with it, deleted after it.
export function withPresizedCopies(store: ObjectStore): ObjectStore {
  return {
    ...store,
    async put(key, body, contentType, options) {
      if (isPresizableCoverKey(key)) await writePresizedCopies(store, key, body)
      await store.put(key, body, contentType, options)
    },
    async copy(sourceKey, destinationKey) {
      await store.copy(sourceKey, destinationKey)
      if (isPresizableCoverKey(destinationKey)) await copyPresized(store, sourceKey, destinationKey)
    },
    async delete(key) {
      await store.delete(key)
      if (isPresizableCoverKey(key)) await Promise.allSettled(presizedPaths(key).map((path) => store.delete(path)))
    },
  }
}
