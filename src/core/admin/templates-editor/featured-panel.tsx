'use client'

import { Button } from '@/core/ui/button'

import type { AdminTemplate } from '../templates/types'
import { SortableList } from '../ui/sortable'
import { featuredCopy as copy } from './copy'
import { FeaturedCard, zhNameOf } from './featured-card'
import { featuredGroups, withGroupOrder, type FeaturedGroup } from './featured-groups'
import { FEATURED_LIMIT } from './featured-state'
import type { Featured } from './use-featured'

type Props = { featured: Featured; templates: AdminTemplate[]; pending: boolean }

// 首页精选 (T53) laid out like the home template area (2026-11-12): a block of cards per category,
// in the order the public pages use. The switch in the table, or the bulk bar, adds templates;
// here they are arranged, removed, and saved in one go.
export function FeaturedPanel({ featured, templates, pending }: Props) {
  const { draft, ids } = featured
  const byId = new Map(templates.map((template) => [template.id, template]))
  const groups = featuredGroups(draft.shown, byId)
  const order = groups.flatMap((group) => group.ids)
  // The card numbers are featured_rank, which decides the generator's default (featured[0] on the
  // home page): the saved ranks, or the ones 保存 will write (page order) while a draft is open.
  const ranks = draft.dirty ? order : ids
  const outOfOrder = !draft.dirty && order.join(',') !== ids.join(',')
  return (
    <section aria-labelledby="featured-h" className="grid gap-3 rounded-md border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="featured-h" className="font-medium">{copy.title}</h2>
        <span className="text-muted-foreground text-sm tabular-nums">{order.length} / {FEATURED_LIMIT}</span>
      </div>
      <p className="text-muted-foreground max-w-[75ch] text-sm">{copy.intro}</p>
      {order.length === 0 && !draft.dirty ? <p className="text-muted-foreground text-sm">{copy.empty}</p> : null}
      {order.length > 0 ? <p className="text-muted-foreground max-w-[75ch] text-sm">{copy.dragHint}</p> : null}
      {draft.dropped ? (
        <Notice text={copy.dropped} action={copy.dismiss} onAction={draft.reset} disabled={false} />
      ) : null}
      {outOfOrder && ids[0] ? (
        <Notice text={copy.outOfOrder(zhNameOf(byId.get(ids[0]), ids[0]))} action={copy.normalise}
          onAction={() => featured.save(order)} disabled={pending} />
      ) : null}
      {groups.map((group) => (
        <GroupCards key={group.key} group={group} pending={pending} rankOf={(id) => ranks.indexOf(id)}
          templateOf={(id) => byId.get(id)} onRemove={(id) => draft.set(order.filter((other) => other !== id))}
          onReorder={(next) => draft.set(withGroupOrder(groups, group.key, next))} />
      ))}
      {draft.dirty ? (
        <div role="status" className="bg-muted sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2 shadow-lg">
          <span className="text-sm">{copy.dirty}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={draft.reset}>{copy.discard}</Button>
            <Button size="sm" disabled={pending} onClick={() => featured.save(order)}>{copy.save}</Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Notice({ text, action, onAction, disabled }: { text: string; action: string; onAction: () => void; disabled: boolean }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1">{text}</span>
      <Button size="sm" variant="outline" disabled={disabled} onClick={onAction}>{action}</Button>
    </div>
  )
}

type GroupProps = {
  group: FeaturedGroup
  pending: boolean
  rankOf: (id: string) => number
  templateOf: (id: string) => AdminTemplate | undefined
  onRemove: (id: string) => void
  onReorder: (ids: string[]) => void
}

// One category's cards. Cards only move inside their category: which block a template sits in
// is its category, changed in the template, not here.
function GroupCards({ group, pending, rankOf, templateOf, onRemove, onReorder }: GroupProps) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">
        {group.nameZh} <span className="text-muted-foreground font-normal">· {group.nameEn} · {group.ids.length} 个</span>
      </h3>
      <SortableList layout="grid" ids={group.ids} disabled={pending}
        labelOf={(id) => zhNameOf(templateOf(id), id)}
        onReorder={async (next) => onReorder(next)}>
        {(shown) => (
          <ol className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
            {shown.map((id) => (
              <FeaturedCard key={id} id={id} template={templateOf(id)} rank={rankOf(id)} pending={pending} onRemove={onRemove} />
            ))}
          </ol>
        )}
      </SortableList>
    </div>
  )
}
