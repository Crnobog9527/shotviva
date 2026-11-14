'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

// The server action the page passes in (modules never import app/): deletes the work and
// redirects to Photos, or answers with why it could not.
export type DeleteWorkAction = () => Promise<{ failed: 'running' | 'error' } | undefined>

// "Delete" at the end of the photo's actions (T41, ARCHITECTURE §6.2「删除作品」): a quiet button in
// the danger colour, then a confirm sheet (drawer on phones, dialog from md, DESIGN §8.4) that
// says it cannot be undone and the credits stay spent.
export function DeleteWork({ action }: { action: DeleteWorkAction }) {
  const t = useTranslations('app.result.delete')
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState<'running' | 'error' | null>(null)
  const [pending, start] = useTransition()
  const confirm = () =>
    start(async () => {
      const result = await action()
      if (result) setFailed(result.failed)
    })
  const close = (next: boolean) => {
    if (pending) return
    setOpen(next)
    setFailed(null)
  }
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={buttonVariants({ variant: 'glass', size: 'touch', className: 'min-h-12 gap-1.5 text-destructive' })}
      >
        <TrashIcon />
        {t('open')}
      </button>
      <ResponsiveSheet open={open} onOpenChange={close} title={t('title')} description={t('body')}>
        {failed ? (
          <p role="alert" className="mt-4 text-caption text-destructive">
            {t(failed === 'running' ? 'running' : 'failed')}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-6 bg-destructive text-background')}
        >
          {t(pending ? 'deleting' : 'confirm')}
        </button>
        <button type="button" disabled={pending} onClick={() => close(false)} className="mt-2 min-h-11 w-full text-label font-medium text-bone-dim">
          {t('cancel')}
        </button>
      </ResponsiveSheet>
    </>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12M10 11v6M14 11v6" />
    </svg>
  )
}
