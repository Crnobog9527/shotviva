'use client'

import { Button } from '@/core/ui/button'

// A question with two answers, in place of the button that asked it.
export function ConfirmRow({ text, yes, no, onYes, onNo }: { text: string; yes: string; no: string; onYes(): void; onNo(): void }) {
  return (
    <div role="alertdialog" aria-label={text} className="grid gap-2">
      <p className="font-medium">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="min-h-11" onClick={onYes}>{yes}</Button>
        <Button size="sm" variant="ghost" className="min-h-11" onClick={onNo}>{no}</Button>
      </div>
    </div>
  )
}
