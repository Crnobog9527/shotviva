import 'server-only'
import { randomUUID } from 'node:crypto'

// The covers folder only: the @/core/admin barrel would pull the admin editors' client code into
// every page that imports @/modules/image (JS budget).
import { publishNewStillCover } from '@/core/admin/covers'
import type { ObjectStore } from '@/core/storage'
import type { StyleRef } from '@/core/templates/style-refs'
import { styleImage } from './style-image'

export type PublishStores = { store: ObjectStore; assets: ObjectStore; assetsBaseUrl: string }
export type PublishSource = {
  output_key: string; photo_key: string; use_style_reference: boolean
  asset: { id: string; width: number; height: number; created_at: string }
}
export type Created = { bucket: 'store' | 'assets'; key: string }
export type DraftAssets = { cover_before_url: string; cover_after_url: string; style_refs: StyleRef[] }

// What the draft template needs, written before the database row exists (the copy flow's order).
// `created` lists only objects this attempt wrote; on a known rollback those, and nothing else,
// are removed. The reference becomes a private style image only when the result was made with it.
export async function writeDraftObjects(deps: PublishStores, templateId: string, source: PublishSource, created: Created[]) {
  const cover = async (slot: 'before' | 'after', key: string) => {
    const result = await publishNewStillCover(deps.assets, deps.assetsBaseUrl, { templateId, slot }, await deps.store.get(key))
    if (result.created) created.push({ bucket: 'assets', key: result.key })
    return result.url
  }
  // Settle every write before reporting a failure, so `created` is complete when the caller cleans.
  const [after, before, refs] = await Promise.allSettled([
    cover('after', source.output_key), cover('before', source.photo_key),
    source.use_style_reference ? styleRef(deps.store, templateId, source.asset, created) : Promise.resolve([]),
  ])
  if (after.status === 'rejected' || before.status === 'rejected' || refs.status === 'rejected') {
    throw new Error('Draft object write failed')
  }
  return { cover_before_url: before.value, cover_after_url: after.value, style_refs: refs.value } satisfies DraftAssets
}

async function styleRef(store: ObjectStore, templateId: string, asset: PublishSource['asset'], created: Created[]): Promise<StyleRef[]> {
  const image = await styleImage({
    bytes: await store.get(`references/${asset.id}.webp`), contentType: 'image/webp', width: asset.width, height: asset.height,
  })
  const key = `style-refs/${templateId}/${randomUUID()}.webp`
  await store.put(key, image.bytes, 'image/webp')
  created.push({ bucket: 'store', key })
  return [{ key, width: image.width ?? asset.width, height: image.height ?? asset.height, uploadedAt: new Date().toISOString() }]
}

export async function removeCreated(deps: PublishStores, created: Created[]) {
  await Promise.allSettled(created.map(item => deps[item.bucket].delete(item.key)))
}
