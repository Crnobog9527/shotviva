'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { useShareSelect } from './select-context'
import { SHARE_MAX, type CreateShareAction } from './share-types'

// The dialog's code loads on the first Create link, not with Photos (scripts/js-budget.json).
const CreateShareSheet = dynamic(() => import('./create-share-sheet').then((mod) => mod.CreateShareSheet), { ssr: false })

// While picking: a bar over the tab bar on phones (sticky at the bottom of the content from md)
// with the count and the one primary, which opens the link dialog.
export function ShareBarBody({ create }: { create: CreateShareAction }) {
  const select = useShareSelect()
  const t = useTranslations('app.workShare')
  const [open, setOpen] = useState(false)
  if (!select) return null
  const count = select.selected.length
  return (
    <>
      <div className="bar-material z-70 grid gap-2 px-(--gutter) pt-3 pb-[calc(var(--sab)+12px)] max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:sticky md:bottom-4 md:mx-(--gutter) md:mt-4 md:rounded-panel md:pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body font-semibold" aria-live="polite">{t('selected', { count })}</p>
          <p className="text-caption text-muted-foreground">{t('max', { max: SHARE_MAX })}</p>
        </div>
        <Button variant="cta" size="cta" disabled={count === 0} onClick={() => setOpen(true)}>
          {t('next')}
        </Button>
      </div>
      {/* Room under the grid so the fixed bar never covers the last row on a phone. */}
      <div aria-hidden="true" className="h-40 md:hidden" />
      {open ? <CreateShareSheet open={open} onOpenChange={setOpen} jobIds={select.selected} create={create} onDone={select.stop} /> : null}
    </>
  )
}
