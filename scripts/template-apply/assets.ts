import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { publishNewStillCover, planStillCover } from '../../src/core/admin/covers/cover-publish'
import { COVER_STILL_TYPES, MAX_COVER_IMAGE_BYTES } from '../../src/core/admin/covers/cover-rules'
import { encodeStyleRef } from '../../src/core/admin/style-refs'
import { sniffImageType, type ObjectStore } from '../../src/core/storage'
import type { StyleRef } from '../../src/core/templates/style-refs'
import { findTestPhoto, findTestRun } from '../../src/modules/image/test-run/test-run-store'
import type { TemplateItem } from './schema'

// Local images → what the admin uploads would have stored. Covers use the cover conversion and
// content-hashed names (applyCover); style references use the editor's encoding. In a dry run
// nothing is written: the URLs and keys are computed so the database checks still run.

export type AssetContext = {
  baseDir: string
  write: boolean
  db: SupabaseClient
  assetsBase?: string
  // Private bucket (style references, trial runs) and public assets bucket (covers).
  privateStore?: ObjectStore
  publicStore?: ObjectStore
}

export type CoverOp =
  | { op: 'set_cover'; before?: string; after?: string }
  | { op: 'test_run_cover'; run_id: string; before: string | null; after: string }

// A bucket call that fails says which part to check, not the SDK's own text (which may be just
// "UnknownError" for a key without access).
export async function bucket<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch {
    throw new Error('R2 访问失败：TEMPLATE_TOOLS_R2_* 的密钥对测试站的桶没有读写权限，或网络不通')
  }
}

async function readImage(ctx: AssetContext, path: string) {
  const full = resolve(ctx.baseDir, path)
  const info = await stat(full).catch(() => null)
  if (!info?.isFile()) throw new Error(`找不到文件 ${path}`)
  if (info.size < 1 || info.size > MAX_COVER_IMAGE_BYTES) throw new Error(`${path} 超过 20MB 或为空`)
  const bytes = new Uint8Array(await readFile(full))
  const type = sniffImageType(bytes)
  if (!type || !COVER_STILL_TYPES.some(t => t === type)) throw new Error(`${path} 不是 JPEG、PNG 或 WebP`)
  return bytes
}

// The same file always gets the same key, so a re-run neither uploads it again nor bumps the
// prompt version. Shaped as a v4 UUID because the stored key format requires one.
export function contentImageId(bytes: Uint8Array): string {
  const hex = createHash('sha256').update(bytes).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export async function resolveStyleRefs(ctx: AssetContext, id: string, paths: string[], current: StyleRef[]): Promise<StyleRef[]> {
  const refs: StyleRef[] = []
  for (const path of paths) {
    const bytes = await readImage(ctx, path)
    const encoded = await encodeStyleRef(id, contentImageId(bytes), bytes)
    const kept = current.find(ref => ref.key === encoded.key)
    if (kept) { refs.push(kept); continue }
    if (ctx.write) {
      if (!ctx.privateStore) throw new Error('上传参考图需要本机配置 TEMPLATE_TOOLS_R2_ACCOUNT_ID、TEMPLATE_TOOLS_R2_ACCESS_KEY_ID、TEMPLATE_TOOLS_R2_SECRET_ACCESS_KEY')
      const store = ctx.privateStore
      if (!(await bucket(() => store.head(encoded.key)))) await bucket(() => store.put(encoded.key, encoded.data, 'image/webp'))
    }
    refs.push({ key: encoded.key, width: encoded.width, height: encoded.height, uploadedAt: new Date().toISOString() })
  }
  return refs
}

function requireBase(ctx: AssetContext) {
  if (!ctx.assetsBase) throw new Error('设置封面需要本机配置 NEXT_PUBLIC_ASSETS_BASE_URL')
  return ctx.assetsBase.replace(/\/+$/, '')
}

async function coverUrl(ctx: AssetContext, id: string, slot: 'before' | 'after', bytes: Uint8Array) {
  const base = requireBase(ctx)
  const target = { templateId: id, slot }
  if (!ctx.write) return `${base}/${(await planStillCover(target, bytes)).key}`
  if (!ctx.publicStore) throw new Error('上传封面需要本机配置 TEMPLATE_TOOLS_R2_* 密钥')
  const store = ctx.publicStore
  return (await bucket(() => publishNewStillCover(store, base, target, bytes))).url
}

// 「设为封面」 on a trial run, converted as setTestRunCover does. The run is checked again in SQL.
async function testRunCover(ctx: AssetContext, id: string, runId: string): Promise<CoverOp> {
  const base = requireBase(ctx)
  if (!ctx.privateStore) {
    if (ctx.write) throw new Error('用试跑结果做封面需要本机配置 TEMPLATE_TOOLS_R2_* 密钥')
    // Dry run without bucket access: the URLs only have to be well-formed for the checks.
    return { op: 'test_run_cover', run_id: runId, before: `${base}/covers/${id}/before-dry-run.webp`, after: `${base}/covers/${id}/after-dry-run.webp` }
  }
  const run = await findTestRun(ctx.db, runId)
  if (!run || run.templateId !== id || run.status !== 'succeeded' || !run.outputKey) throw new Error('试跑记录不存在、未成功或不属于这个模板')
  const photo = run.photoId ? await findTestPhoto(ctx.db, run.photoId) : null
  const store = ctx.privateStore
  const after = await coverUrl(ctx, id, 'after', await bucket(() => store.get(run.outputKey as string)))
  const before = photo ? await coverUrl(ctx, id, 'before', await bucket(() => store.get(photo.objectKey))) : null
  return { op: 'test_run_cover', run_id: runId, before, after }
}

export async function resolveCover(ctx: AssetContext, id: string, cover: NonNullable<TemplateItem['cover']>): Promise<CoverOp> {
  if ('testRun' in cover) return testRunCover(ctx, id, cover.testRun)
  const op: CoverOp = { op: 'set_cover' }
  if (cover.before) op.before = await coverUrl(ctx, id, 'before', await readImage(ctx, cover.before))
  if (cover.after) op.after = await coverUrl(ctx, id, 'after', await readImage(ctx, cover.after))
  return op
}
