import { planDelete } from '../templates/bulk-task-rules'
import type { AdminTemplate } from '../templates/types'
import { bulkMoreCopy as copy } from './bulk-more-copy'

// The confirm-step batch actions (Owner 2026-11-14) and what each would do with the ticked
// templates: which it handles and which it skips, with why, before anything is sent.
export type BulkTask = 'delete' | 'saleOn' | 'saleOff' | 'seriesJoin' | 'seriesLeave' | 'duplicate'
export type TaskPlan = { will: AdminTemplate[]; skipped: { template: AdminTemplate; reason: string }[] }

const isSystem = (template: AdminTemplate) => !!template.categoryInfo.isSystem || template.id === 'freeform' || template.id === 'edit'

function split(selected: readonly AdminTemplate[], reasonFor: (template: AdminTemplate) => string | null): TaskPlan {
  const plan: TaskPlan = { will: [], skipped: [] }
  for (const template of selected) {
    const reason = reasonFor(template)
    if (reason) plan.skipped.push({ template, reason })
    else plan.will.push(template)
  }
  return plan
}

export function planTask(task: BulkTask, selected: readonly AdminTemplate[]): TaskPlan {
  switch (task) {
    case 'delete': {
      const { deletable, skipped } = planDelete(selected)
      return { will: deletable, skipped }
    }
    case 'saleOn':
      return split(selected, t => isSystem(t) ? copy.notSystem : t.saleEnabled ? copy.alreadyOn : null)
    case 'saleOff':
      return split(selected, t => isSystem(t) ? copy.notSystem : !t.saleEnabled ? copy.alreadyOff : t.isActive ? copy.liveSale : null)
    case 'seriesJoin':
    case 'duplicate':
      return split(selected, t => isSystem(t) ? copy.notSystem : null)
    case 'seriesLeave':
      return split(selected, t => t.seriesId ? null : copy.notInSeries)
  }
}

export type OrderGroup = 'active' | 'inactive'

// 移到最前 / 最后: the ticked templates keep their relative order and go to the start or the end
// of their list (上架 and 下架 are ordered separately, T76). One new order per list they are in.
export function movedOrders(templates: readonly Pick<AdminTemplate, 'id' | 'isActive'>[], selected: ReadonlySet<string>, top: boolean) {
  return (['active', 'inactive'] as const).flatMap(group => {
    const ids = templates.filter(t => t.isActive === (group === 'active')).map(t => t.id)
    const picked = ids.filter(id => selected.has(id))
    if (picked.length === 0) return []
    const rest = ids.filter(id => !selected.has(id))
    const next = top ? [...picked, ...rest] : [...rest, ...picked]
    return next.every((id, i) => id === ids[i]) ? [] : [{ group, ids: next, expectedIds: ids }]
  })
}
