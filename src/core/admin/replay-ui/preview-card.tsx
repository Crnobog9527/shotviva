import type { ReactNode } from 'react'

import type { ReplayPreview } from '@/core/billing/stripe'
import { Button } from '@/core/ui/button'

import { formatBeijing } from '../shell/format'
import { REPLAY_COPY as COPY } from './copy'
import { UserLink } from '../users-ui/user-link'

type Props = { preview: ReplayPreview; pending: boolean; onCancel: () => void; onConfirm: () => void }

function money(minor: number | null, currency: string | null): string {
  if (minor === null || !currency) return '—'
  const format = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency.toUpperCase() })
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}

function Details({ preview }: { preview: ReplayPreview }) {
  const user = (
    <UserLink userId={preview.userId}>{preview.userId}</UserLink>
  )
  if (preview.kind === 'checkout') {
    return (
      <dl className="grid gap-1 text-sm">
        <Row label={COPY.checkout.user} value={user} />
        <Row label={COPY.checkout.product} value={preview.credits == null ? preview.productId : `${preview.productId} · ${COPY.checkout.credits(preview.credits)}`} />
        <Row label={COPY.checkout.amount} value={money(preview.amountTotal, preview.currency)} />
      </dl>
    )
  }
  return (
    <dl className="grid gap-1 text-sm">
      <Row label={COPY.checkout.user} value={user} />
      <Row label={COPY.checkout.product} value={preview.productId} />
      <Row label={COPY.subscription.status} value={preview.status} />
      <Row label={COPY.subscription.periodEnd} value={formatBeijing(preview.periodEnd)} />
      <Row label={COPY.subscription.cancel} value={preview.cancelAtPeriodEnd ? COPY.yes : COPY.no} />
    </dl>
  )
}

// What Stripe says right now, and whether confirming would change anything.
export function PreviewCard({ preview, pending, onCancel, onConfirm }: Props) {
  const done = preview.kind === 'checkout' ? preview.settled : false
  const note = preview.kind === 'checkout' ? (preview.settled ? COPY.checkout.settled : COPY.checkout.pending) : preview.mirrored ? COPY.subscription.mirrored : COPY.subscription.missing
  const canConfirm = preview.kind === 'checkout' || preview.mirrored
  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="font-mono text-xs">{preview.id}</p>
      <Details preview={preview} />
      <p className={done ? 'text-sm text-muted-foreground' : 'text-sm'}>{note}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          {COPY.cancel}
        </Button>
        {canConfirm ? (
          <Button onClick={onConfirm} disabled={pending}>
            {preview.kind === 'checkout' ? COPY.confirm : COPY.confirmSync}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
