import type { SupabaseClient } from '@supabase/supabase-js'

import type { AdminTemplate } from '../../src/core/admin/templates/types'
import type { GenerationProvider } from '../../src/core/jobs'
import { estimateRunUsd } from '../../src/modules/image/test-run/estimate'
import { readPricingOptions } from '../../src/site/template-pricing'
import { RunError } from '../template-apply/batch-file'
import type { Cell, EffectiveModel } from './cells'

// What a trial run needs to know before it starts: which model each template will really use (the
// bound provider, or the site default as it is now), what one call may cost, and that the actor is
// an admin there (checked before any photo is uploaded).

// The face-swap screen's call is small; this keeps the reservation above any real call.
const JUDGE_ALLOWANCE_USD = 0.005

export async function effectiveModels(db: SupabaseClient): Promise<EffectiveModel> {
  const options = await readPricingOptions(db)
  const active = options.find(option => option.isActive)
  return (template: AdminTemplate) => {
    const bound = template.prompt?.providerId
    const option = bound ? options.find(o => o.id === bound) : active
    return { providerId: option?.id ?? bound ?? 'env', model: option?.model ?? 'unknown' }
  }
}

// One estimate per cell: the trial's own estimate (estimateRunUsd) with the prices of the provider
// it will call, plus the face-swap screen. A bound template counts the dearer of its provider and
// the default it may fall back to. Providers are resolved once per binding.
export async function estimates(cells: Cell[], templates: Map<string, AdminTemplate>, bound: (id: string | null) => Promise<GenerationProvider[]>) {
  const providers = new Map<string, Promise<GenerationProvider[]>>()
  const perCell = new Map<Cell, number>()
  for (const cell of cells) {
    const template = templates.get(cell.templateId)
    if (!template) continue
    const binding = template.prompt?.providerId ?? null
    const key = binding ?? 'default'
    if (!providers.has(key)) providers.set(key, bound(binding))
    const prices = (await providers.get(key)!).map(p => estimateRunUsd(cell.resolution, template.quality, p.prices))
    perCell.set(cell, Math.max(...prices) + JUDGE_ALLOWANCE_USD)
  }
  return (cell: Cell) => perCell.get(cell) ?? Number.POSITIVE_INFINITY
}

export async function assertAdmin(db: SupabaseClient, actorId: string) {
  const { data, error } = await db.from('profiles').select('role,banned_at').eq('id', actorId).maybeSingle()
  if (error) throw new RunError('读取操作人失败')
  if (data?.role !== 'admin' || data.banned_at) throw new RunError('SHOTVIVA_IMPORT_ADMIN_ID 不是目标站未封禁的管理员，没有上传照片，也没有调用模型')
}
