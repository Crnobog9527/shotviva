'use client'

import { useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'
import { ResponsiveSheet } from '../../ui/responsive-sheet'

type Props = {
  tierName: string
  periodEnd: Date
  open: boolean
  setOpen(open: boolean): void
  failed: boolean
  pending: boolean
  confirm(): void
}

export function WaffoCancelDialog({ tierName, periodEnd, open, setOpen, failed, pending, confirm }: Props) {
  const t = useTranslations('app.account.plan')
  return (
    <ResponsiveSheet open={open} onOpenChange={setOpen} title={t('cancelTitle')} description={t('cancelBody', { tier: tierName, date: periodEnd })}>
      <div className="mt-6 grid gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
          {t('cancelKeep')}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          aria-busy={pending}
          className="inline-flex min-h-12 items-center justify-center rounded-control text-label font-semibold text-destructive hover:bg-wash disabled:opacity-60"
        >
          {pending ? t('cancelPending') : t('cancelConfirm')}
        </button>
        <p aria-live="polite" className="min-h-5 text-center text-caption text-destructive">
          {failed ? t('cancelFailed') : null}
        </p>
      </div>
    </ResponsiveSheet>
  )
}
