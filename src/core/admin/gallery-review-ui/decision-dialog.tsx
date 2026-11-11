'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { REVIEW_COPY as COPY } from '../gallery-review/copy'
import type { Decision, PendingDecision } from './types'

type Props = { decision: PendingDecision; pending: boolean; onCancel: () => void; onConfirm: (decision: Decision) => void }

function text(decision: Decision) {
  const n = decision.jobIds.length
  return decision.decision === 'approved'
    ? COPY.confirm.approve(n)
    : COPY.confirm.reject(n, COPY.reasons[decision.reason ?? 'other'] ?? '')
}

// Every decision is confirmed first (DESIGN §7): approving publishes works, rejecting takes them down.
export function DecisionDialog({ decision, pending, onCancel, onConfirm }: Props) {
  const copy = decision ? text(decision) : null
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.confirm.cancel}
          </Button>
          <Button
            variant={decision?.decision === 'rejected' ? 'destructive' : 'default'}
            disabled={pending || !decision}
            onClick={() => decision && onConfirm(decision)}
          >
            {copy?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
