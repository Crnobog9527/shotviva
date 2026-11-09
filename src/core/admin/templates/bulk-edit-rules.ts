import { hasCompleteCoverSet } from '@/core/templates/cover-locales'
import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { MISSING_COST, floorGuidance, providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'
import { creditsBelowFloor, type CreditsCost, type TemplateQuality } from '@/core/templates/pricing'
import type { TemplateSurface } from '@/core/templates/schema'
import type { Template } from '@/core/templates/types'

// Batch edit (T79, ARCHITECTURE §10 「模板批量编辑」): what one save changes, and which ticked
// templates it would leave below the price floor or half-ready on the web. Pure, so the dialog
// shows the same verdict before saving as the five-argument admin_bulk_edit_templates RPC.

export type BulkEditPatch = {
  // Only the tiers that change; the rest keep each template's own price.
  creditsCost?: Partial<CreditsCost>
  visibleIn?: TemplateSurface[]
  quality?: TemplateQuality
  // A template_categories key (T75), never a system category.
  categoryKey?: string
}

export type BulkEditFailure =
  | { id: string; name: string; reason: 'below_floor'; resolution: Resolution; floor: number; given: number }
  | { id: string; name: string; reason: 'web_incomplete' | 'not_found' | 'system' }

export type BulkEditOutcome = { changed: number; failures: BulkEditFailure[] }

export type BulkEditCandidate = Pick<
  Template,
  'id' | 'name' | 'quality' | 'creditsCost' | 'visibleIn' | 'isActive' | 'description' | 'coverBeforeUrl' | 'coverAfterUrl' | 'coverLocales'
> & { categoryInfo?: { isSystem: boolean }; prompt?: { providerId: string | null } | null }

// The built-in templates: photo edit has its own page, and the partner API's free-prompt
// `freeform` must not pick up a web template's prices, entry points or category from a 「全选」.
// T75 puts both in system categories; the ids are kept too, as the RPC does. The dialog leaves them
// out; the SQL function refuses them as `system`.
export const BULK_EDIT_SYSTEM_IDS: ReadonlySet<string> = new Set([EDIT_TEMPLATE_ID, 'freeform'])
export const isBulkEditable = (template: { id: string; categoryInfo?: { isSystem: boolean }; prompt?: { providerId: string | null } | null }) =>
  !BULK_EDIT_SYSTEM_IDS.has(template.id) && template.categoryInfo?.isSystem !== true

const RESOLUTION_LABEL: Record<Resolution, string> = { '1k': 'Standard', '2k': 'HD', '3k': 'Max' }

export const isEmptyPatch = (patch: BulkEditPatch) =>
  Object.keys(patch.creditsCost ?? {}).length === 0 && !patch.visibleIn && !patch.quality && !patch.categoryKey

const blank = (text: string | null) => !text || text.trim() === ''

// A live template newly put on the web must already have what a web card shows (T60 rules).
function webIncomplete(template: BulkEditCandidate, visibleIn: readonly TemplateSurface[]): boolean {
  if (!template.isActive || template.visibleIn.includes('web') || !visibleIn.includes('web')) return false
  return blank(template.description) || !hasCompleteCoverSet(template)
}

// Each template as it would be after the edit, checked against the floor of its (possibly new)
// quality. Empty means the batch may be saved.
export function bulkEditFailures(
  templates: readonly BulkEditCandidate[],
  patch: BulkEditPatch,
  floor: ProviderFloors,
): BulkEditFailure[] {
  return templates.flatMap((template): BulkEditFailure[] => {
    if (!isBulkEditable(template)) return [{ id: template.id, name: template.name, reason: 'system' }]
    const quality = patch.quality ?? template.quality
    const cost = { ...template.creditsCost, ...patch.creditsCost }
    const { id, name } = template
    const low = creditsBelowFloor(quality, cost, providerFloor(floor, template.prompt?.providerId)).map((v) => ({ id, name, reason: 'below_floor' as const, ...v }))
    const web = webIncomplete(template, patch.visibleIn ?? template.visibleIn)
    return web ? [...low, { id, name, reason: 'web_incomplete' }] : low
  })
}

export function describeFailure(failure: BulkEditFailure): string {
  switch (failure.reason) {
    case 'below_floor':
      if (failure.floor === MISSING_COST) return `${RESOLUTION_LABEL[failure.resolution]}：${floorGuidance(failure.floor)}`
      return `${RESOLUTION_LABEL[failure.resolution]} ${failure.given} 低于下限 ${failure.floor}（差 ${failure.floor - failure.given}）`
    case 'web_incomplete':
      return '已上架，缺英文说明或前后对比封面，不能加到站内'
    case 'system':
      return '系统模板（作品编辑 / 伙伴自由生成），不参与批量编辑'
    case 'not_found':
      return '模板不存在（可能已被删除），请刷新页面'
  }
}

// The confirm step's list of what changes, in the editor's own words.
export function describePatch(patch: BulkEditPatch, categoryName: (key: string) => string = (key) => key): string[] {
  const lines: string[] = []
  const tiers = RESOLUTIONS.filter((resolution) => patch.creditsCost?.[resolution] !== undefined)
  if (tiers.length > 0) {
    lines.push(`积分：${tiers.map((r) => `${RESOLUTION_LABEL[r]} → ${patch.creditsCost?.[r]}`).join('，')}`)
  }
  if (patch.visibleIn) {
    const label = { web: '站内', partner: '伙伴' } as const
    lines.push(`展示入口 → ${patch.visibleIn.map((surface) => label[surface]).join(' + ')}`)
  }
  if (patch.quality) lines.push(`出图质量 → ${patch.quality}`)
  if (patch.categoryKey) lines.push(`分类 → ${categoryName(patch.categoryKey)}`)
  return lines
}
