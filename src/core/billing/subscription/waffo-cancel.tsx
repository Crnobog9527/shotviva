'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { passButton } from './plan-parts'

const Dialog = dynamic(() => import('./waffo-cancel-dialog').then(m => m.WaffoCancelDialog), { ssr: false })

export type CancelWaffoAction = () => Promise<{ ok: boolean }>
type Props = { action: CancelWaffoAction; tierName: string; periodEnd: Date }

export function WaffoCancelButton({ action, tierName, periodEnd }: Props) {
  const t = useTranslations('app.account.plan')
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  function show() {
    setFailed(false)
    setMounted(true)
    setOpen(true)
  }
  const confirm = () => start(async () => {
    const result = await action().catch(() => ({ ok: false }))
    setFailed(!result.ok)
    if (result.ok) setOpen(false)
  })
  return (
    <>
      <button type="button" aria-haspopup="dialog" className={passButton(false)} onClick={show}>
        {t('cancelSubscription')}
      </button>
      {mounted && <Dialog tierName={tierName} periodEnd={periodEnd} open={open} setOpen={setOpen}
        failed={failed} pending={pending} confirm={confirm} />}
    </>
  )
}
