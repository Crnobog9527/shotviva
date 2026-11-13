import 'server-only'

import { opaqueWebp, type ObjectStore } from '../storage'
import { AppError } from '../errors'
import type { StyleRef } from '../templates/style-refs'
import type { ProviderImage } from './provider'

// Per private bucket and process. Share concurrent reads; failed reads remain retryable.
const stores = new WeakMap<ObjectStore, Map<string, Promise<ProviderImage>>>()
// The upload pipeline bounds each normalized WebP to 1536 × 1536.
const CACHE_ENTRIES = 8

function cacheFor(store: ObjectStore) {
  const cache = stores.get(store) ?? new Map<string, Promise<ProviderImage>>()
  stores.set(store, cache)
  return cache
}

function readRef(store: ObjectStore, version: number, ref: StyleRef): Promise<ProviderImage> {
  const cache = cacheFor(store)
  // The immutable key includes the template id; a new template version reloads its bytes.
  const cacheKey = `${version}:${ref.key}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
  // Flattened once per cache entry: a reference with alpha would reach the model with its
  // transparent area as black or guessed (see-through.ts).
  const pending = store.get(ref.key).then(opaqueWebp).then(
    (bytes) => ({ bytes, contentType: 'image/webp', width: ref.width, height: ref.height }),
    () => {
      if (cache.get(cacheKey) === pending) cache.delete(cacheKey)
      throw new AppError('INTERNAL', 'Template reference unavailable')
    },
  )
  cache.set(cacheKey, pending)
  return pending
}

export function readStyleImages(store: ObjectStore, version: number, refs: readonly StyleRef[]) {
  return Promise.all(refs.map((ref) => readRef(store, version, ref)))
}
