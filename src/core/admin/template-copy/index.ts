import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'
import { executeCopies, planCopies, removeCopies, templateId } from './assets'

const request = z.object({ source: templateId, requestId: z.uuidv4() })
type Deps = { db: SupabaseClient; stores: { public: ObjectStore; private: ObjectStore }; base?: string }
const errors: Record<string, string> = {
  SOURCE_CHANGED: '复制期间原模板已修改，请再点一次复制。',
  TEMPLATE_NOT_FOUND: '找不到可复制的普通模板或当前提示词。',
  REQUEST_MISMATCH: '复制请求已失效，请重新打开模板列表。',
}

function refusal(code: string) {
  return new AppError('INVALID_INPUT', errors[code] ?? '未能确认副本状态，请重试。')
}

export async function duplicateTemplate(deps: Deps, actor: string, input: unknown) {
  const parsed = request.safeParse(input)
  if (!parsed.success) throw refusal('REQUEST_MISMATCH')
  const { source, requestId } = parsed.data
  const args = { p_source: source, p_actor: actor, p_request: requestId }
  const manifest = await deps.db.rpc('admin_template_copy_source', args)
  if (manifest.error) throw refusal(manifest.error.message)
  const result = z.union([
    z.object({ existing: templateId }), z.object({ assets: z.unknown(), token: z.string().min(1) }),
  ]).parse(manifest.data)
  if ('existing' in result) return result.existing
  const target = `${source.slice(0, 22).replace(/-$/, '')}-copy-${randomUUID()}`
  const plan = planCopies(source, target, deps.base, result.assets)
  await executeCopies(deps.stores, plan.copies)
  const { data, error } = await deps.db.rpc('admin_commit_template_copy', {
    ...args, p_target: target, p_token: result.token, p_assets: plan.assets,
  })
  if (error) {
    // These are known transaction rollbacks. Never delete on an ambiguous commit/transport error.
    if (Object.hasOwn(errors, error.message) || /^[0-9A-Z]{5}$/.test(error.code) && !error.code.startsWith('08')) {
      await removeCopies(deps.stores, plan.copies)
    }
    throw refusal(error.message)
  }
  const id = templateId.parse(data)
  if (target !== id) await removeCopies(deps.stores, plan.copies)
  return id
}
