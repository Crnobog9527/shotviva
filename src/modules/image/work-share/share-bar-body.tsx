'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState } from 'react'

import { Button, buttonVariants } from '@/core/ui/button'

import { BulkSaveButton } from './bulk-save-button'
import { useShareSelect } from './select-context'
import { SHARE_MAX, type BulkDeleteAction, type CreateShareAction } from './share-types'

// The dialogs' code loads on first use, not with Photos (scripts/js-budget.json).
const CreateShareSheet = dynamic(() => import('./create-share-sheet').then((mod) => mod.CreateShareSheet), { ssr: false })
const BulkDeleteSheet = dynamic(() => import('./bulk-delete-sheet').then((mod) => mod.BulkDeleteSheet), { ssr: false })

// While picking: a bar over the tab bar on phones (sticky at the bottom of the content from md)
// with the count and what to do with the picked works: download them, delete them, or the one
// primary, a share link (作品页改版 PR④). remove: the page's delete action; without it no Delete.
export function ShareBarBody({ create, remove }: { create: CreateShareAction; remove?: BulkDeleteAction }) {
  const select = useShareSelect()
  const t = useTranslations('app.workShare')
  const [open, setOpen] = useState<'share' | 'delete' | null>(null)
  if (!select) return null
  const count = select.selected.length
  return (
    <>
      <div className="bar-material z-70 grid gap-2 px-(--gutter) pt-3 pb-[calc(var(--sab)+12px)] max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:sticky md:bottom-4 md:mx-(--gutter) md:mt-4 md:rounded-panel md:pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body font-semibold" aria-live="polite">{t('selected', { count })}</p>
          <p className="text-caption text-muted-foreground">{t('max', { max: SHARE_MAX })}</p>
        </div>
        {count > 0 ? (
          <div className="flex items-start gap-2">
            {/* Remounted when the picked works change: a save under way belongs to the old set. */}
            <BulkSaveButton key={select.selected.join()} jobIds={select.selected} />
            {remove ? (
              <button type="button" aria-haspopup="dialog" onClick={() => setOpen('delete')} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'shrink-0 px-6 text-destructive' })}>
                {t('bulk.delete')}
              </button>
            ) : null}
          </div>
        ) : null}
        <Button variant="cta" size="cta" disabled={count === 0} onClick={() => setOpen('share')}>
          {t('next')}
        </Button>
      </div>
      {/* Room under the grid so the fixed bar never covers the last row on a phone. */}
      <div aria-hidden="true" className="h-56 md:hidden" />
      {open === 'share' ? <CreateShareSheet open onOpenChange={(next) => setOpen(next ? 'share' : null)} jobIds={select.selected} create={create} onDone={select.stop} /> : null}
      {open === 'delete' && remove ? <BulkDeleteSheet open onOpenChange={(next) => setOpen(next ? 'delete' : null)} jobIds={select.selected} remove={remove} onDone={select.stop} /> : null}
    </>
  )
}
