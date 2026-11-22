'use client'

import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

// The page's server action, bound to one work (core never imports app/).
export type DeleteOrgWorkAction = () => Promise<{ failed: 'running' | 'error' } | undefined>

// 企业作品: the owner deletes one of the org's works. An icon button next to download, then a
// confirm sheet (drawer on phones, dialog from md) that says it cannot be undone and is recorded.
export function DeleteOrgWork({ action, name }: { action: DeleteOrgWorkAction; name: string }) {
  const t = useTranslations('app.org.works.delete')
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState<'running' | 'error' | null>(null)
  const [pending, start] = useTransition()
  const confirm = () =>
    start(async () => {
      const result = await action()
      if (result) setFailed(result.failed)
      else setOpen(false)
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
        aria-label={t('open', { name })}
        onClick={() => setOpen(true)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-bone-dim hover:bg-wash hover:text-destructive"
      >
        <Trash2 aria-hidden strokeWidth={1.75} className="size-[18px]" />
      </button>
      <ResponsiveSheet open={open} onOpenChange={close} title={t('title')} description={t('body')}>
        {failed ? (
          <p role="alert" className="mt-4 text-caption text-destructive">{t(failed)}</p>
        ) : null}
        <button type="button" disabled={pending} onClick={confirm} className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-6 bg-destructive text-background')}>
          {t(pending ? 'deleting' : 'confirm')}
        </button>
        <button type="button" disabled={pending} onClick={() => close(false)} className="mt-2 min-h-11 w-full text-label font-medium text-bone-dim">
          {t('cancel')}
        </button>
      </ResponsiveSheet>
    </>
  )
}
