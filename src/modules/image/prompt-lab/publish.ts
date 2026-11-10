import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError, type ErrorCode } from '@/core/errors'
import { input, publishInput } from './contracts'
import { removeCreated, writeDraftObjects, type Created, type PublishSource, type PublishStores } from './publish-objects'

export type PublishDeps = PublishStores & { db: SupabaseClient }
export type PublishReceipt = { id: string; existing: boolean }

const receipt = z.object({ id: z.string().min(1), existing: z.boolean() })
const source = z.union([
  z.object({ existing: z.object({ id: z.string().min(1) }) }),
  z.object({ run: z.object({
    output_key: z.string().regex(/^prompt-lab\/outputs\/[0-9a-f-]{36}\.png$/), photo_key: z.string().min(1),
    use_style_reference: z.boolean(),
    asset: z.object({ id: z.uuid(), width: z.number().int().positive(), height: z.number().int().positive(), created_at: z.string() }),
  }) }),
])
const messages: Record<string, [ErrorCode, string]> = {
  NOT_ADMIN: ['NOT_FOUND', '无权访问'],
  TEMPLATE_EXISTS: ['CONFLICT', '这个模板 ID 已被占用，请换一个'],
  INVALID_CATEGORY: ['INVALID_INPUT', '请选择一个有效的模板分类'],
  RUN_NOT_PUBLISHABLE: ['CONFLICT', '只有已完成的试跑结果可以发布'],
  MODEL_CHANGED: ['CONFLICT', '这格结果的出图模型已变更或删除，无法按原模型发布'],
  REFERENCE_ARCHIVED: ['CONFLICT', '素材已归档或不可用'],
  PROMPT_LAB_UNAVAILABLE: ['CONFLICT', '素材已归档或不可用'],
  PROMPT_LAB_RUN_NOT_FOUND: ['NOT_FOUND', '试跑记录已不存在'],
  INVALID_INPUT: ['INVALID_INPUT', '请检查模板 ID、名称和分类'],
}
// Only our own codes reach the admin: PostgreSQL diagnostics could quote the private prompt.
const failure = (message: string) => {
  const [code, text] = messages[message] ?? ['INTERNAL', '发布失败，请重试']
  return new AppError(code, text)
}
// Known rollbacks mean nothing committed. A transport or unknown failure may have committed, so it
// never deletes. An id taken in the meantime may share content-hashed covers with that template.
const rolledBack = (error: { code?: string; message: string }) =>
  error.message !== 'TEMPLATE_EXISTS' && error.code !== '23505' &&
  (/^(22|23)/.test(error.code ?? '') || ['P0001', '40001', '40P01'].includes(error.code ?? ''))

// 「发布为模板」 (ARCHITECTURE §5 T101): result → "after" cover, its test photo → "before", the
// reference → a private style image when the run used one; then one transaction writes the draft,
// its prompt (copied in the database), the closed sale mark and the source link.
export async function publishLabRun(deps: PublishDeps, actor: string, raw: unknown): Promise<PublishReceipt> {
  const p = input(publishInput, raw)
  const args = { p_actor: actor, p_run_id: p.runId }
  const read = await deps.db.rpc('admin_prompt_lab_publish_source', { ...args, p_template_id: p.template.id })
  if (read.error) throw failure(read.error.message)
  const manifest = source.safeParse(read.data)
  if (!manifest.success) throw new AppError('INTERNAL', '无法读取试跑结果')
  if ('existing' in manifest.data) return { id: manifest.data.existing.id, existing: true }
  const created: Created[] = []
  let assets
  try {
    assets = await writeDraftObjects(deps, p.template.id, manifest.data.run as PublishSource, created)
  } catch {
    await removeCreated(deps, created)
    throw new AppError('INTERNAL', '封面生成失败，请重试')
  }
  const { data, error } = await deps.db.rpc('admin_publish_prompt_lab_run', {
    ...args, p_template: { id: p.template.id, name: p.template.name, name_zh: p.template.nameZh, category: p.template.category },
    p_assets: assets, p_assets_base: deps.assetsBaseUrl,
  })
  if (error) {
    if (rolledBack(error)) await removeCreated(deps, created)
    throw failure(error.message)
  }
  const committed = receipt.parse(data)
  // Someone else published this result first: our copies were never referenced.
  if (committed.existing && committed.id !== p.template.id) await removeCreated(deps, created)
  return committed
}
