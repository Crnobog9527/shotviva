'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { REJECT_REASONS, type RejectReason } from '@/core/moderation/reasons'

import { REVIEW_COPY as COPY } from '../gallery-review/copy'
import type { Decision, PendingDecision } from './types'

type Props = {
  decision: PendingDecision
  pending: boolean
  onReason: (reason: RejectReason) => void
  onCancel: () => void
  onConfirm: (decision: Decision) => void
}

function text(decision: Decision) {
  const n = decision.jobIds.length
  return decision.decision === 'approved' ? COPY.confirm.approve(n) : COPY.confirm.reject(n)
}

function ReasonPicker({ reason, onReason }: { reason: RejectReason; onReason: (reason: RejectReason) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{COPY.reasonLabel}</span>
      <select
        className="rounded-md border border-border bg-background px-2 py-1"
        value={reason}
        onChange={(event) => onReason(event.target.value as RejectReason)}
      >
        {REJECT_REASONS.map((key) => (
          <option key={key} value={key}>
            {COPY.reasons[key]}
          </option>
        ))}
      </select>
    </label>
  )
}

type FooterProps = { decision: Decision; pending: boolean; onCancel: () => void; onConfirm: (decision: Decision) => void }

function Footer({ decision, pending, onCancel, onConfirm }: FooterProps) {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onCancel} disabled={pending}>
        {COPY.confirm.cancel}
      </Button>
      <Button variant={decision.decision === 'rejected' ? 'destructive' : 'default'} disabled={pending} onClick={() => onConfirm(decision)}>
        {text(decision).confirm}
      </Button>
    </DialogFooter>
  )
}

// Every decision is confirmed first (DESIGN §7): approving publishes works, rejecting takes them
// down and asks why.
export function DecisionDialog({ decision, pending, onReason, onCancel, onConfirm }: Props) {
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onCancel()}>
      {decision ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text(decision).title}</DialogTitle>
            <DialogDescription>{text(decision).body}</DialogDescription>
          </DialogHeader>
          {decision.decision === 'rejected' ? <ReasonPicker reason={decision.reason ?? 'other'} onReason={onReason} /> : null}
          <Footer decision={decision} pending={pending} onCancel={onCancel} onConfirm={onConfirm} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
