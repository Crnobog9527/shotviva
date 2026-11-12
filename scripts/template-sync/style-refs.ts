import { createHash } from 'node:crypto'

import sharp from 'sharp'

import { MAX_COVER_IMAGE_BYTES } from '../../src/core/admin/covers'
import { sniffImageType, type ObjectStore } from '../../src/core/storage'
import { isStyleRefKey, type StyleRef } from '../../src/core/templates/style-refs'
import { SyncError } from './covers'

// Each side's private uploads bucket (2026-11-12). Only style-refs/<template>/… keys are read or written.
export type PrivateStore = Pick<ObjectStore, 'head' | 'get' | 'put'>

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// The stored WebP the test site's row describes: a WebP of exactly the recorded size and pixels.
async function readSource(id: string, ref: StyleRef, source: PrivateStore) {
  if (!isStyleRefKey(id, ref.key)) throw new SyncError('INVALID_STYLE_REFS')
  const head = await source.head(ref.key)
  if (!head || head.size < 1 || head.size > MAX_COVER_IMAGE_BYTES) throw new SyncError('STYLE_REF_MISSING')
  const bytes = await source.get(ref.key, MAX_COVER_IMAGE_BYTES)
  if (bytes.length !== head.size || sniffImageType(bytes) !== 'image/webp') throw new SyncError('INVALID_STYLE_REF_OBJECT')
  const meta = await sharp(bytes).metadata().catch(() => null)
  if (meta?.width !== ref.width || meta.height !== ref.height) throw new SyncError('INVALID_STYLE_REF_OBJECT')
  return bytes
}

// Copies the references to the same keys in production's private bucket, before the database names
// them. A key already there must hold the same bytes (keys are immutable: an upload's random id, or
// templates:apply's content-derived one), so a re-run writes nothing; any other content is a
// conflict and nothing is overwritten. Returns how many objects were written.
export async function copyStyleRefs(id: string, refs: readonly StyleRef[], source: PrivateStore, target: PrivateStore) {
  let written = 0
  for (const ref of refs) {
    const bytes = await readSource(id, ref, source)
    const existing = await target.head(ref.key)
    if (existing) {
      const stored = existing.size === bytes.length ? await target.get(ref.key, MAX_COVER_IMAGE_BYTES) : null
      if (!stored || digest(stored) !== digest(bytes)) throw new SyncError('STYLE_REF_CONFLICT')
      continue
    }
    await target.put(ref.key, bytes, 'image/webp')
    written += 1
  }
  return written
}
