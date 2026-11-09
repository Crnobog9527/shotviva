'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { DiscountSummary } from '../../codes/ui'
import { usePaymentChannel } from './channel-context'
import { refreshDiscount, useDiscount } from './discount-context'

const RedeemForm = dynamic(() => import('../../codes/ui').then(module => module.RedeemForm))

export function DiscountBanner({ singlePayment = false }: { singlePayment?: boolean }) {
  const t = useTranslations('paywall')
  const { pending, guestCode } = useDiscount()
  const channel = usePaymentChannel()
  if (!pending && !guestCode) return null
  return <div role="status" className="mt-4 rounded-control border border-hairline bg-wash px-4 py-3 text-label">
    {guestCode ? t('guestDiscount') : channel === 'waffo' ? t('waffoNoDiscount')
      : pending && <DiscountSummary value={pending} singlePayment={singlePayment} />}
  </div>
}

export function DiscountEntry() {
  const { buyer, pending } = useDiscount()
  const [open, setOpen] = useState(false)
  const formId = useId()
  const t = useTranslations('paywall')
  if (!buyer) return null
  return <div className="mt-3">
    <button type="button" aria-expanded={open} aria-controls={formId} onClick={() => setOpen(!open)}
      className="min-h-11 text-label font-medium underline decoration-muted-foreground underline-offset-4">{t('codeEntry')}</button>
    <div id={formId}>{open && <RedeemForm context="paywall" pendingCode={pending?.code ?? null} onRedeemed={refreshDiscount} />}</div>
  </div>
}
