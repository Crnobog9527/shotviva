import { z } from 'zod'

// The batch actions that go template by template through each one's own audited path (删除,
// 售卖, 系列, 复制): which went through and which were skipped, with the reason in Chinese.
export type BulkTaskOutcome = { done: string[]; skipped: { id: string; reason: string }[] }

// 200 covers the whole catalogue many times over, as for 批量上架 (T60).
export const idsSchema = z
  .array(z.string().min(1).max(64))
  .min(1)
  .max(200)
  .refine(ids => new Set(ids).size === ids.length, 'ids must be unique')

// 删除 is offered for unpublished, non-built-in templates only (1401). The bar says up front how
// many of the ticked ones it will skip and why, so the confirm step never surprises.
export type DeletePlan<T> = { deletable: T[]; skipped: { template: T; reason: string }[] }

export function planDelete<T extends { id: string; isActive: boolean; categoryInfo: { isSystem?: boolean } }>(selected: readonly T[]): DeletePlan<T> {
  const plan: DeletePlan<T> = { deletable: [], skipped: [] }
  for (const template of selected) {
    if (template.categoryInfo.isSystem || template.id === 'freeform' || template.id === 'edit') plan.skipped.push({ template, reason: '系统模板不能删除' })
    else if (template.isActive) plan.skipped.push({ template, reason: '已上架，先下架才能删除' })
    else plan.deletable.push(template)
  }
  return plan
}

// 停止售卖 needs the template unpublished first (admin_set_template_sale): same up-front split.
export function planSale<T extends { isActive: boolean; saleEnabled?: boolean }>(selected: readonly T[], enabled: boolean) {
  const changing = selected.filter(template => !!template.saleEnabled !== enabled)
  return {
    changing: enabled ? changing : changing.filter(template => !template.isActive),
    live: enabled ? [] : changing.filter(template => template.isActive),
    unchanged: selected.length - changing.length,
  }
}
