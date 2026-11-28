'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import type { BulkDeleteAction, BulkDeleteResult } from './share-types'

type Props = { open: boolean; onOpenChange(open: boolean): void; jobIds: readonly string[]; remove: BulkDeleteAction; onDone(): void }

// The confirm before deleting the picked works (作品页改版 PR④; the same words as one work's
// delete, ARCHITECTURE §6.2「删除作品」): it cannot be undone and the credits stay spent. When every
// work went, it closes and select mode ends; when some stayed, it says how many and why.
export function BulkDeleteSheet({ open, onOpenChange, jobIds, remove, onDone }: Props) {
  const t = useTranslations('app.workShare.bulk')
  const [result, setResult] = useState<BulkDeleteResult | null>(null)
  const [pending, start] = useTransition()
  const count = jobIds.length
  const confirm = () =>
    start(async () => {
      const outcome = await remove([...jobIds])
      const kept = outcome.running + outcome.org + outcome.failed
      if (kept === 0) return onDone()
      setResult(outcome)
    })
  const close = (next: boolean) => {
    if (pending) return
    if (!next && result) return onDone()
    onOpenChange(next)
  }
  return (
    <ResponsiveSheet open={open} onOpenChange={close} title={result ? t('partTitle', { count: result.deleted }) : t('deleteTitle', { count })} description={result ? <Kept result={result} /> : t('deleteBody')}>
      {result ? (
        <button type="button" onClick={() => close(false)} className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-6')}>
          {t('close')}
        </button>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={confirm} className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-6 bg-destructive text-background')}>
            {t(pending ? 'deleting' : 'deleteConfirm', { count })}
          </button>
          <button type="button" disabled={pending} onClick={() => close(false)} className="mt-2 min-h-11 w-full text-label font-medium text-bone-dim">
            {t('cancel')}
          </button>
        </>
      )}
    </ResponsiveSheet>
  )
}

function Kept({ result }: { result: BulkDeleteResult }) {
  const t = useTranslations('app.workShare.bulk')
  return (
    <span role="alert" className="grid gap-1">
      {result.org > 0 ? <span>{t('keptOrg', { count: result.org })}</span> : null}
      {result.running > 0 ? <span>{t('keptRunning', { count: result.running })}</span> : null}
      {result.failed > 0 ? <span>{t('keptFailed', { count: result.failed })}</span> : null}
    </span>
  )
}
