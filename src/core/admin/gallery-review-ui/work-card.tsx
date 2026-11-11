'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import { REVIEW_COPY as COPY } from '../gallery-review/copy'
import type { ReviewWork } from '../gallery-review/types'
import { formatBeijing } from '../shell/format'

type Props = {
  work: ReviewWork
  selected: boolean
  disabled: boolean
  onSelect: (selected: boolean) => void
  onApprove: () => void
  onReject: () => void
}

function screenLine(work: ReviewWork): string {
  if (work.categories.length > 0) return COPY.flagged(work.categories.join('、'))
  return work.screenedAt ? COPY.screened : COPY.notScreened
}

function Facts({ work }: { work: ReviewWork }) {
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{work.templateName}</p>
      <p>
        {formatBeijing(work.createdAt)} · {COPY.pool[work.creditPool]}
      </p>
      <p className={work.categories.length > 0 ? 'text-destructive' : undefined}>{screenLine(work)}</p>
      {work.reason ? <p>{`${COPY.reasonLabel}：${COPY.reasons[work.reason] ?? work.reason}`}</p> : null}
      {work.reports.count > 0 ? (
        <p className="text-destructive">{COPY.reports(work.reports.count, work.reports.reasons.map((r) => COPY.reasons[r] ?? r).join('、'))}</p>
      ) : null}
      {work.copy.length > 0 ? <p className="line-clamp-3 break-words">{`${COPY.copyLabel}：${work.copy.join(' / ')}`}</p> : null}
    </div>
  )
}

// One work on /admin/gallery: the image as stored (no watermark), what the screen said, the
// reports, and the two decisions.
export function WorkCard({ work, selected, disabled, onSelect, onApprove, onReject }: Props) {
  return (
    <li className="grid content-start gap-2 rounded-lg border border-border bg-card p-2">
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        {work.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed private URL, not optimisable
          <img src={work.imageUrl} alt={work.templateName} loading="lazy" className="size-full object-contain" />
        ) : (
          <p className="grid size-full place-items-center text-xs text-muted-foreground">{COPY.noImage}</p>
        )}
        <label className="absolute left-2 top-2 rounded bg-background/90 p-1">
          <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={work.templateName} />
        </label>
        <Badge className="absolute right-2 top-2" variant={work.status === 'approved' ? 'default' : 'secondary'}>
          {COPY.tabs[work.status]}
        </Badge>
      </div>
      <Facts work={work} />
      <div className="flex gap-2">
        {work.status !== 'approved' ? (
          <Button size="sm" disabled={disabled} onClick={onApprove}>
            {COPY.approve}
          </Button>
        ) : null}
        {work.status !== 'rejected' ? (
          <Button size="sm" variant="outline" disabled={disabled} onClick={onReject}>
            {COPY.reject}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
