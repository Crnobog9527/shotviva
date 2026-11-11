'use client'

import { useState } from 'react'

import type { RejectReason } from '@/core/moderation/reasons'

import { REVIEW_COPY as COPY } from '../gallery-review/copy'
import type { ReviewPage } from '../gallery-review/types'
import { EmptyState } from '../shell/admin-blocks'
import { useAdminAction } from '../shell/use-admin-action'
import { DecisionDialog } from './decision-dialog'
import { ReviewToolbar } from './review-toolbar'
import type { Decision, PendingDecision, ReviewActions } from './types'
import { WorkCard } from './work-card'

type Props = { page: ReviewPage; actions: ReviewActions }

// /admin/gallery (ARCHITECTURE §9 第 5 条): one tab of works, single and batch decisions, each
// confirmed. The action refreshes the page, so the list follows what is stored.
export function ReviewBoard({ page, actions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [decision, setDecision] = useState<PendingDecision>(null)
  const { pending, error, notice, run } = useAdminAction()

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const ask = (jobIds: string[], kind: Decision['decision']) =>
    setDecision({ jobIds, decision: kind, reason: kind === 'rejected' ? 'other' : null })
  const setReason = (reason: RejectReason) => setDecision((current) => (current ? { ...current, reason } : current))
  const confirm = (input: Decision) =>
    run(
      () => actions.decide(input),
      (changed) => {
        setDecision(null)
        setSelected(new Set())
        return COPY.done(changed)
      },
    )

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{COPY.intro}</p>
      <ReviewToolbar
        tab={page.tab}
        selected={selected.size}
        total={page.works.length}
        disabled={pending}
        onSelectAll={() => setSelected(new Set(page.works.map((work) => work.id)))}
        onBatch={(kind) => ask([...selected], kind)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground" role="status">{notice}</p> : null}
      {page.works.length === 0 ? (
        <EmptyState title={COPY.empty[page.tab]} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {page.works.map((work) => (
            <WorkCard
              key={work.id}
              work={work}
              selected={selected.has(work.id)}
              disabled={pending}
              onSelect={(on) => toggle(work.id, on)}
              onApprove={() => ask([work.id], 'approved')}
              onReject={() => ask([work.id], 'rejected')}
            />
          ))}
        </ul>
      )}
      {page.next ? (
        <a className="justify-self-start text-sm underline" href={`/admin/gallery?tab=${page.tab}&after=${encodeURIComponent(page.next)}`}>
          {COPY.more}
        </a>
      ) : null}
      <DecisionDialog decision={decision} pending={pending} onReason={setReason} onCancel={() => setDecision(null)} onConfirm={confirm} />
    </div>
  )
}
