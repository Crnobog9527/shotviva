import { hasCompleteCoverSet } from '@/core/templates/cover-locales'
import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'
import { providerFloor, type ProviderFloors } from '@/core/templates/provider-pricing'
import { creditsBelowFloor } from '@/core/templates/pricing'
import type { Template } from '@/core/templates/types'

// When a template may go live (T60). The single 上架 switch and the bulk bar both run these
// rules through setTemplatesActive, so one template is never judged two ways. Pure: the editor
// imports the labels, the unit tests the rules.

export const PUBLISH_BLOCKERS = [
  'not_found',
  'system',
  'retired',
  'no_prompt',
  'no_name',
  'no_description',
  'no_cover',
  'below_floor',
] as const
export type PublishBlocker = (typeof PUBLISH_BLOCKERS)[number]

export const PUBLISH_BLOCKER_LABEL: Record<PublishBlocker, string> = {
  not_found: '模板不存在',
  system: '系统模板，在「作品编辑」页单独管理',
  retired: '当前目录未开放此模板销售',
  no_prompt: '缺提示词',
  no_name: '缺英文名称',
  no_description: '缺英文说明（站内模板必填）',
  no_cover: '缺前后对比封面（通用或任一已上线语言里要有前图和后图，站内模板必填）',
  below_floor: '积分低于下限',
}

export type PublishCandidate = Pick<
  Template,
  'id' | 'name' | 'description' | 'visibleIn' | 'coverBeforeUrl' | 'coverAfterUrl' | 'coverLocales' | 'quality' | 'creditsCost' | 'isActive'
> & { hasPrompt: boolean; category?: string; providerId?: string | null }

// The built-in photo-edit template (ARCHITECTURE §5.2) is switched on its own page; the editor
// list never shows it. Deep imports keep this file free of the server-side templates barrel.
const SYSTEM_TEMPLATE_IDS: ReadonlySet<string> = new Set([EDIT_TEMPLATE_ID])

const blank = (text: string | null) => !text || text.trim() === ''

// What stops this template from going live. Web templates show on the home page and in Create,
// which read the name, the English description and both covers (site/content/home-templates).
// Partner-only rows such as `freeform` never render a card, so they only need a prompt, a name
// and a price at or above the floor.
export function publishBlockers(template: PublishCandidate, floor: ProviderFloors): PublishBlocker[] {
  if (SYSTEM_TEMPLATE_IDS.has(template.id)) return ['system']
  const prices = providerFloor(floor, template.providerId, template.id, template.category, template.quality, template.visibleIn.includes('partner'))
  if (prices.styleUnavailable || prices.retiredRoom) return ['retired']
  const onWeb = template.visibleIn.includes('web')
  const checks: [PublishBlocker, boolean][] = [
    ['no_prompt', !template.hasPrompt],
    ['no_name', blank(template.name)],
    ['no_description', onWeb && blank(template.description)],
    // A before and an after every launched page can show under the cover fallback (T87).
    ['no_cover', onWeb && !hasCompleteCoverSet(template)],
    ['below_floor', creditsBelowFloor(template.quality, template.creditsCost, prices).length > 0],
  ]
  return checks.filter(([, failed]) => failed).map(([blocker]) => blocker)
}

export type ActiveChangeItem = { id: string; name: string }
export type ActiveChangeSkip = ActiveChangeItem & { blockers: PublishBlocker[] }

// The outcome of one batch: what flipped, what already was in the asked state, and what was
// left alone with its reasons. Partial success is the normal case, not an error.
export type ActiveChangeOutcome = {
  active: boolean
  changed: ActiveChangeItem[]
  unchanged: ActiveChangeItem[]
  skipped: ActiveChangeSkip[]
}

// Sorts the asked ids into the three groups, in the order they were asked. Unpublishing has no
// readiness rule beyond the row existing and not being a system template.
export function planActiveChange(
  ids: readonly string[],
  rows: readonly PublishCandidate[],
  active: boolean,
  floor: ProviderFloors,
): ActiveChangeOutcome {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const outcome: ActiveChangeOutcome = { active, changed: [], unchanged: [], skipped: [] }
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) {
      outcome.skipped.push({ id, name: id, blockers: ['not_found'] })
      continue
    }
    const item = { id, name: row.name }
    const blockers = active ? publishBlockers(row, floor) : SYSTEM_TEMPLATE_IDS.has(id) ? (['system'] as const) : []
    if (blockers.length > 0) outcome.skipped.push({ ...item, blockers: [...blockers] })
    else if (row.isActive === active) outcome.unchanged.push(item)
    else outcome.changed.push(item)
  }
  return outcome
}

export function describeBlockers(blockers: readonly PublishBlocker[]): string {
  return blockers.map((blocker) => PUBLISH_BLOCKER_LABEL[blocker]).join('、')
}
