'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import type { PurchaseLine } from '../../billing/documents/lines'
import { SheetRow } from './sheet-rows'

// Settings → Purchases: the recent payments, each with the payment provider's receipt and,
// where there is one, its invoice (ARCHITECTURE §6.3, T80). The links go to our own redirect,
// which reads Stripe's link on the click; a row Stripe could not answer for comes back here
// with ?purchases=unavailable, and the sheet opens with a note.

const PurchaseHistory = dynamic(() => import('./purchase-history').then((m) => m.PurchaseHistory))
const UNAVAILABLE = 'unavailable'

// Drop ?purchases= once the note has been seen, without a navigation.
function clearParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('purchases')) return
  url.searchParams.delete('purchases')
  window.history.replaceState(null, '', url)
}

export function PurchasesRow({ purchases, more }: { purchases: readonly PurchaseLine[]; more: boolean }) {
  const t = useTranslations('app.account')
  const unavailable = useSearchParams().get('purchases') === UNAVAILABLE
  const count = purchases.length
  const value =
    count === 0 ? t('settings.purchasesNone') : <span className="font-mono tracking-normal">{more ? t('settings.purchasesMany', { count }) : count}</span>
  return (
    <SheetRow label={t('settings.purchases')} value={value} title={t('purchases.title')} description={t('purchases.lead')} initialOpen={unavailable} onClose={clearParam}>
      <PurchaseHistory purchases={purchases} unavailable={unavailable} />
    </SheetRow>
  )
}
