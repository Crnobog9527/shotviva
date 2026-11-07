import Link from 'next/link'
import type { ReactNode } from 'react'

import { FILE_FIELDS, type DisputeRow, type LiveDispute } from '@/core/billing/stripe'

import { DISPUTES_COPY as COPY } from '../disputes/copy'
import { formatBeijing } from '../shell'
import { AttachForm } from './attach-form'
import { DISPUTE_UI as UI } from './copy'
import { EvidencePreview } from './evidence-preview'
import { StatusBadge } from './status-badge'
import { SubmitPanel } from './submit-panel'
import type { DisputeActions } from './types'
import { FILE_LABELS, toCard } from './view-model'
import { SupplementForm } from './supplement-form'

type Props = { row: DisputeRow; live: LiveDispute | null; now: Date; stripeUrl: string; actions: DisputeActions }

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ row, live, now, stripeUrl }: Omit<Props, 'actions'>) {
  const card = toCard({ ...row, live }, now)
  const drafted = row.evidence_drafted_at ? UI.draftedAt(formatBeijing(row.evidence_drafted_at.toISOString()) ?? '') : UI.notDrafted
  return (
    <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label={UI.facts.user}>
        {row.user_id ? <Link href={`/admin/users/${row.user_id}`} className="text-primary hover:underline">{card.user}</Link> : card.user}
      </Fact>
      <Fact label={UI.facts.product}>{row.product_id ?? '—'}</Fact>
      <Fact label={UI.facts.due}>
        <span className={card.tone === 'urgent' ? 'font-medium' : undefined}>{card.due}</span>
        {card.daysLeft ? <span className="text-muted-foreground"> · {card.daysLeft}</span> : null}
      </Fact>
      <Fact label={UI.facts.responder}>{card.responder}</Fact>
      <Fact label={UI.facts.drafted}>{drafted}</Fact>
      <Fact label={UI.facts.charge}>
        <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {COPY.stripeLink}
        </a>
      </Fact>
    </dl>
  )
}

function Actions({ row, live, actions, amount }: { row: DisputeRow; live: LiveDispute; actions: DisputeActions; amount: string }) {
  if (row.submitted_at) return <p className="text-sm">{UI.submitted(formatBeijing(row.submitted_at.toISOString()) ?? '')}</p>
  if (!live.open) return <p className="text-sm text-muted-foreground">{UI.closed}</p>
  const slots = FILE_FIELDS.map((field) => ({ field, label: FILE_LABELS[field] }))
  return (
    <>
      <Section title={UI.attachTitle}>
        <AttachForm id={row.stripe_dispute_id} slots={slots} actions={actions} />
      </Section>
      <Section title={UI.submitTitle}>
        {row.responder === 'shotviva' ? <SubmitPanel id={row.stripe_dispute_id} amount={amount} submit={actions.submit} /> : <p className="text-sm text-muted-foreground">{UI.stripeOnly}</p>}
      </Section>
    </>
  )
}

// /admin/disputes/[id]: what happened, what Stripe holds as the draft, and the Owner's three
// actions (edit the summary, attach a file, submit once).
export function DisputeDetail({ row, live, now, stripeUrl, actions }: Props) {
  const card = toCard({ ...row, live }, now)
  return (
    <div className="grid gap-4">
      <Link href="/admin/disputes" className="text-sm text-primary hover:underline">
        {COPY.back}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tabular-nums">{card.amount}</h1>
        <StatusBadge label={card.status} tone={card.tone} />
        {card.banned ? <span className="text-sm text-muted-foreground">{COPY.bannedTag}</span> : null}
      </div>
      <p className="text-sm">{card.reason}</p>
      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{COPY.responderHint[row.responder]}</p>
      <Facts row={row} live={live} now={now} stripeUrl={stripeUrl} />
      {live ? (
        <>
          <Section title={UI.evidenceTitle}>
            <EvidencePreview live={live} missing={UI.evidenceMissing} />
            {live.open && !row.submitted_at ? <SupplementForm id={row.stripe_dispute_id} initial={live.text.uncategorized_text ?? ''} save={actions.saveText} /> : null}
          </Section>
          <Actions row={row} live={live} actions={actions} amount={card.amount} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{UI.liveMissing}</p>
      )}
    </div>
  )
}
