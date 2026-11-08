import type { ClawbackPreview } from '../orders'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { CLAWBACK_COPY as COPY } from './copy'

type Props = { preview: ClawbackPreview; pending: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }

// The second confirmation (DESIGN §7): the numbers come from the server just before, and the
// server computes them again under a lock when it applies.
export function ClawbackDialog({ preview, pending, error, onCancel, onConfirm }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.facts(preview)}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">{preview.available > 0 ? COPY.will(preview.available) : COPY.nothing}</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button variant="destructive" disabled={pending || preview.available === 0} onClick={onConfirm}>
            {COPY.confirm(preview.available)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
