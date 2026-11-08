'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import type { CatalogueToggle } from '../catalogue/catalogue-template'

type Props = { toggle: CatalogueToggle | null; onAccept(): void; onCancel(): void }

// The dialog before a toggle turns on (T89): the template's own title, body, checkbox and accept
// text (per template, per language); accept stays disabled until the box is ticked. Cancel, the
// close button, Esc or a swipe down all keep the toggle off.
export function ToggleConfirmSheet({ toggle, onAccept, onCancel }: Props) {
  // The last dialog stays rendered while it closes, so its closing motion can play.
  const [shown, setShown] = useState(toggle)
  if (toggle && toggle !== shown) setShown(toggle)
  const confirm = shown?.confirm
  if (!shown || !confirm) return null
  return (
    <ResponsiveSheet open={toggle !== null} onOpenChange={(open) => !open && onCancel()} title={confirm.title} description={null}>
      <ConfirmBody key={shown.key} body={confirm.body} checkbox={confirm.checkbox} accept={confirm.accept} onAccept={onAccept} onCancel={onCancel} />
    </ResponsiveSheet>
  )
}

type BodyProps = { body: string; checkbox: string; accept: string; onAccept(): void; onCancel(): void }

function ConfirmBody({ body, checkbox, accept, onAccept, onCancel }: BodyProps) {
  const t = useTranslations('app.workspace.toggles')
  const [ticked, setTicked] = useState(false)
  return (
    <div className="pt-3">
      <p className="text-body leading-[1.5] text-pretty whitespace-pre-line text-bone-dim">{body}</p>
      <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-label leading-[1.35] font-medium">
        <Checkbox checked={ticked} onCheckedChange={(checked) => setTicked(checked === true)} className="mt-0.5 size-5" />
        <span>{checkbox}</span>
      </label>
      <button type="button" disabled={!ticked} onClick={onAccept} className={buttonVariants({ variant: 'cta', size: 'cta', className: 'mt-5 disabled:opacity-40' })}>
        {accept}
      </button>
      <button type="button" onClick={onCancel} className="mt-2 min-h-11 w-full text-label font-medium text-bone-dim">
        {t('cancel')}
      </button>
    </div>
  )
}
