import { useState } from 'react'
import { Button } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'
import { Textarea } from '@/core/ui/textarea'
import { seriesCopy as copy } from './copy'

export function UnpublishSheet({ open, close, submit }: { open: boolean; close: () => void; submit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <ResponsiveSheet open={open} onOpenChange={on => !on && close()} title={copy.confirmTitle} description={copy.confirmText}>
      <label className="mt-3 grid gap-2 text-sm">{copy.reason}
        <Textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>{copy.cancel}</Button>
        <Button variant="destructive" disabled={!reason.trim()} onClick={() => submit(reason.trim())}>{copy.confirm}</Button>
      </div>
    </ResponsiveSheet>
  )
}
