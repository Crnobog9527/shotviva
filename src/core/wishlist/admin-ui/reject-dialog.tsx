import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { AdminRequest } from '../types'
import { COPY } from './copy'

type Props = {
  request: AdminRequest | null
  pending: boolean
  onCancel: () => void
  onConfirm: (request: AdminRequest) => void
}

// Rejecting or taking down deletes the reference images for good, so it is confirmed first
// (DESIGN §7). No reason is asked: the author never sees one (ARCHITECTURE §15.4).
export function RejectDialog({ request, pending, onCancel, onConfirm }: Props) {
  const text = request?.status === 'live' ? COPY.reject.takeDown : COPY.reject.reject
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.reject.cancel}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => request && onConfirm(request)}>
            {text.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
