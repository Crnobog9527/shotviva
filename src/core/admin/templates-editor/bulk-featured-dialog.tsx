'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { describeFeaturedFailure, FEATURED_LIMIT, planBlocked, planFeaturedChange, type FeaturedPlan } from '../templates/bulk-featured-rules'
import type { AdminTemplate } from '../templates/types'
import { bulkCopy, bulkFeaturedCopy as copy } from './copy'
import type { BulkFeatured } from './use-bulk-featured'

type Props = { bulk: BulkFeatured; selected: AdminTemplate[]; featuredIds: string[] }

// The confirm step names every ticked template with what will happen to it, the list's size
// before and after, and why the batch cannot be saved when it cannot (all or nothing).
export function BulkFeaturedDialog({ bulk, selected, featuredIds }: Props) {
  const on = bulk.asking
  const plan = on === null ? null : (bulk.refused ?? planFeaturedChange(featuredIds, selected, on))
  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && bulk.close()}>
      {plan ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title(plan.featured, selected.length)}</DialogTitle>
            <DialogDescription>{copy.hint(plan.featured)}</DialogDescription>
          </DialogHeader>
          <PlanList plan={plan} nameOf={(id) => zhName(selected, id)} />
          <PlanVerdict plan={plan} before={featuredIds.length} />
          <DialogFooter>
            <Button variant="outline" onClick={bulk.close} disabled={bulk.pending}>{bulkCopy.cancel}</Button>
            <Button
              variant={plan.featured ? 'default' : 'destructive'}
              disabled={bulk.pending || planBlocked(plan) || plan.changed.length === 0}
              onClick={() => bulk.run(selected.map((template) => template.id), featuredIds)}
            >
              {copy.confirm(plan.featured)}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

// The Chinese name the list shows, as the catalogue rows do.
function zhName(selected: readonly AdminTemplate[], id: string) {
  const template = selected.find((other) => other.id === id)
  return template?.translations.zh?.name?.trim() || template?.name || id
}

function PlanList({ plan, nameOf }: { plan: FeaturedPlan; nameOf: (id: string) => string }) {
  const rows = [
    ...plan.failures.map((item) => ({ ...item, tone: 'text-destructive', label: `${copy.failed}：${describeFeaturedFailure(item)}` })),
    ...plan.changed.map((item) => ({ ...item, tone: 'text-emerald-700 dark:text-emerald-400', label: copy.willChange(plan.featured) })),
    ...plan.unchanged.map((item) => ({ ...item, tone: 'text-muted-foreground', label: copy.unchanged(plan.featured) })),
  ]
  return (
    <ul className="max-h-60 overflow-y-auto rounded-md border p-3 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline justify-between gap-3 py-0.5">
          <span className="min-w-0 truncate" title={row.id}>{nameOf(row.id)}</span>
          <span className={`shrink-0 text-xs ${row.tone}`}>{row.label}</span>
        </li>
      ))}
    </ul>
  )
}

function PlanVerdict({ plan, before }: { plan: FeaturedPlan; before: number }) {
  const problem = plan.failures.length > 0 ? copy.blocked : plan.over > 0 ? copy.over(plan.over, FEATURED_LIMIT) : null
  return (
    <div className="grid gap-1 text-sm">
      <p className="tabular-nums">{copy.count(before, plan.next.length, FEATURED_LIMIT)}</p>
      {problem ? <p role="alert" className="text-destructive">{problem}</p> : null}
      {!problem && plan.changed.length === 0 ? <p className="text-muted-foreground">{copy.nothing(plan.featured)}</p> : null}
    </div>
  )
}
