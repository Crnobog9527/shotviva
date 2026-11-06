'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { buttonVariants } from '../../ui/button'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import { passButton } from './plan-parts'

export type CancelWaffoAction = () => Promise<{ ok: boolean }>

type Props = { action: CancelWaffoAction; tierName: string; periodEnd: Date }

// "Cancel subscription" on a Waffo card subscription (T50, ARCHITECTURE §6.3): Waffo has no
// Customer Portal of ours, so this is the one cancel screen the site draws. A sheet asks once
// (DESIGN §8.4, never a native confirm); the server action cancels at period end through Waffo
// and the page shows "Ends …" once it reloads.
export function WaffoCancelButton({ action, tierName, periodEnd }: Props) {
  const t = useTranslations('app.account.plan')
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const confirm = () =>
    start(async () => {
      const result = await action().catch(() => ({ ok: false }))
      setFailed(!result.ok)
      if (result.ok) setOpen(false)
    })
  return (
    <>
      <button type="button" className={passButton(false)} onClick={() => (setFailed(false), setOpen(true))}>
        {t('cancelSubscription')}
      </button>
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
    </>
  )
}
