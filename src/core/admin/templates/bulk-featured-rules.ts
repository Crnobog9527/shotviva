import type { TemplateSurface } from '@/core/templates/schema'

// Batch 首页精选 (2026-11-12, ARCHITECTURE §10 「模板批量编辑」 + §12 home item 3): what setting or
// clearing the ticked templates does to the featured list. Pure, so the confirm dialog shows the
// same verdict the server reaches before it writes anything.

export const FEATURED_LIMIT = 12

export type FeaturedCandidate = {
  id: string
  name: string
  isActive: boolean
  visibleIn: readonly TemplateSurface[]
}

export type FeaturedItem = { id: string; name: string }
// not_live: unpublished or not shown on the site; not_found: deleted since the page loaded.
export type FeaturedFailure = FeaturedItem & { reason: 'not_live' | 'not_found' }

export type FeaturedPlan = {
  featured: boolean
  // The whole featured list after the change, in display order: additions go to the end.
  next: string[]
  changed: FeaturedItem[]
  // Already in (setting) or already out (clearing): nothing to do for them.
  unchanged: FeaturedItem[]
  failures: FeaturedFailure[]
  // How many past the limit the list would be; 0 when it fits.
  over: number
}

export const isFeaturable = (template: Pick<FeaturedCandidate, 'isActive' | 'visibleIn'>) =>
  template.isActive && template.visibleIn.includes('web')

const item = ({ id, name }: FeaturedItem): FeaturedItem => ({ id, name })

// `current`: the featured ids in display order. `selected`: the ticked templates in catalogue
// order (the list's order, not the order they were ticked in), and the new ones are appended in
// that order; an id with no row (deleted meanwhile) comes as { id, name: id, missing }.
export function planFeaturedChange(
  current: readonly string[],
  selected: readonly (FeaturedCandidate | (FeaturedItem & { missing: true }))[],
  featured: boolean,
): FeaturedPlan {
  const plan: FeaturedPlan = { featured, next: [...current], changed: [], unchanged: [], failures: [], over: 0 }
  for (const template of selected) {
    const isIn = plan.next.includes(template.id)
    if ('missing' in template) {
      plan.failures.push({ ...item(template), reason: 'not_found' })
    } else if (isIn === featured) {
      plan.unchanged.push(item(template))
    } else if (!featured) {
      plan.next = plan.next.filter((id) => id !== template.id)
      plan.changed.push(item(template))
    } else if (!isFeaturable(template)) {
      plan.failures.push({ ...item(template), reason: 'not_live' })
    } else {
      plan.next.push(template.id)
      plan.changed.push(item(template))
    }
  }
  plan.over = Math.max(0, plan.next.length - FEATURED_LIMIT)
  return plan
}

// Saved only as a whole: any failure or going past the limit saves nothing.
export const planBlocked = (plan: FeaturedPlan) => plan.failures.length > 0 || plan.over > 0

export function describeFeaturedFailure(failure: FeaturedFailure): string {
  return failure.reason === 'not_live' ? '未上架或不在站内显示，不能上首页' : '模板不存在（可能已被删除），请刷新页面'
}
