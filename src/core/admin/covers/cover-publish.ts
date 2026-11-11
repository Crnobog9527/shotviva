import 'server-only'

import type { ObjectStore } from '@/core/storage'

import { stillCover } from './cover-media'

// One still cover (before / after) from bytes the server already holds, published exactly as an
// uploaded one is (ARCHITECTURE §8.3): WebP at the cover rules' edge and quality, content-hashed
// name under covers/{template_id}/, cached forever. Used by 「设为封面」 on an admin test run (T85),
// whose result and test photo sit in the private bucket. Returns the public URL.
export const IMMUTABLE = 'public, max-age=31536000, immutable'

export async function publishStillCover(
  assets: ObjectStore,
  assetsBaseUrl: string,
  target: { templateId: string; slot: 'before' | 'after' },
  bytes: Uint8Array,
): Promise<string> {
  return (await publishNewStillCover(assets, assetsBaseUrl, target, bytes)).url
}

// The same publication, also saying whether this call wrote a new object. A caller that may roll
// back (「发布为模板」, T101) deletes only objects it created: a content-hashed key that already
// existed may be another template's live cover.
export async function publishNewStillCover(
  assets: ObjectStore,
  assetsBaseUrl: string,
  target: { templateId: string; slot: 'before' | 'after' },
  bytes: Uint8Array,
): Promise<{ url: string; key: string; created: boolean }> {
  const file = await stillCover(bytes)
  const key = `covers/${target.templateId}/${target.slot}-${file.hash}.${file.ext}`
  const created = !(await assets.head(key))
  if (created) await assets.put(key, file.bytes, file.contentType, { cacheControl: IMMUTABLE })
  return { url: `${assetsBaseUrl}/${key}`, key, created }
}
