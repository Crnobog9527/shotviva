'use client'

/* eslint-disable @next/next/no-img-element -- local photo previews and template covers */
import { ChevronRightIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { cn } from '@/core/ui/cn'

import { CheckBox, pressedOf } from './check-box'
import { coverOf, type ReviewActions } from './review-actions'
import { groupSummary, type ReviewGroup } from './review-groups'
import { ReviewRowView } from './review-row'

type Props = { group: ReviewGroup; open: boolean; onToggle(): void; onSelect(on: boolean): void; actions: ReviewActions }

// One template's results (or one photo's), folding under its head (Owner 2026-11-28). Folded,
// the head still says what the group makes: count, tiers, notes, credits.
export function ReviewGroupView({ group, open, onToggle, onSelect, actions }: Props) {
  const t = useTranslations('app.matrix.review')
  const panel = `group-${group.by}-${group.id}`
  const picked = group.rows.filter((row) => actions.selected.has(row.cell.key)).length
  const state = picked === 0 ? 'off' : picked === group.rows.length ? 'on' : 'some'
  return (
    <section className="hairline-lit rounded-[20px] bg-card">
      <div className="flex items-center gap-1 pr-1.5">
        <h3 className="min-w-0 flex-1">
          <button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle} className="press flex min-h-16 w-full items-center gap-2.5 py-2 pl-3 text-left">
            <ChevronRightIcon aria-hidden="true" className={cn('size-[18px] flex-none text-muted-foreground transition-transform duration-200', open && 'rotate-90')} />
            <GroupImage group={group} />
            <GroupTitle group={group} />
          </button>
        </h3>
        <button type="button" aria-pressed={pressedOf(state)} aria-label={t('selectGroupNamed', { name: groupName(group, t) })} onClick={() => onSelect(state !== 'on')} className="inline-flex min-h-11 flex-none items-center gap-2 px-2 text-caption font-medium text-bone-dim hover:text-foreground">
          <CheckBox state={state} />
          <span className="max-md:hidden">{t('selectGroup')}</span>
        </button>
      </div>
      {open ? (
        <ul id={panel} className="divide-y divide-hairline border-t border-hairline">
          {group.rows.map((row) => <ReviewRowView key={row.cell.key} row={row} by={group.by} actions={actions} />)}
        </ul>
      ) : null}
    </section>
  )
}

function GroupImage({ group }: { group: ReviewGroup }) {
  const first = group.rows[0]!
  const src = group.by === 'template' ? coverOf(first.cell) : first.photo.url
  return (
    <span className="hairline block size-10 flex-none overflow-hidden rounded-[10px] bg-muted">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" className={cn('size-full object-cover', group.by === 'photo' && REPLAY_BLOCK_CLASS)} /> : null}
    </span>
  )
}

function GroupTitle({ group }: { group: ReviewGroup }) {
  const t = useTranslations('app.matrix.review')
  const summary = groupSummary(group)
  const title = groupName(group, t)
  const tiers = summary.tiers.map(([tier, count]) => `${tier.toUpperCase()}×${count}`).join(' ')
  return (
    <span className="min-w-0 flex-1">
      <b className="block truncate text-body leading-[1.25] font-semibold">{title}</b>
      <span className="line-clamp-2 text-caption text-muted-foreground md:line-clamp-1">
        {t('groupSummary', { kept: summary.kept, tiers, notes: summary.notes, credits: summary.credits })}
      </span>
    </span>
  )
}

// A template group by its template; a photo group by its place in the batch and its file name.
function groupName(group: ReviewGroup, t: ReturnType<typeof useTranslations<'app.matrix.review'>>): string {
  const first = group.rows[0]!
  if (group.by === 'template') return first.cell.template.name
  return `${t('photoGroup', { index: first.index + 1 })}${first.photo.name ? ` · ${first.photo.name}` : ''}`
}
