'use client'

import { ArrowUpRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import type { PurchaseLine } from '../../billing/documents/lines'
import { Link } from '../../i18n/ui'
import { EmptyState, STATE_GHOST } from '../../ui/empty-state'
import { SheetRow } from './sheet-rows'

// Settings → Purchases: the recent payments, each with the payment provider's receipt and,
// where there is one, its invoice (ARCHITECTURE §6.3, T80). The links go to our own redirect,
// which reads Stripe's link on the click; a row Stripe could not answer for comes back here
// with ?purchases=unavailable, and the sheet opens with a note.

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
      {unavailable ? (
        <p role="status" className="mt-4 rounded-control bg-muted px-3 py-2.5 text-caption leading-relaxed text-muted-foreground">
          {t('purchases.unavailable')}
        </p>
      ) : null}
      {count === 0 ? (
        <EmptyState
          icon="receipt"
          title={t('purchases.empty')}
          body={t('purchases.emptyBody')}
          action={
            <Link href="/pricing" className={STATE_GHOST}>
              {t('purchases.seePlans')}
            </Link>
          }
          className="mx-0 md:mx-0"
        />
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {purchases.map((line) => (
            <PurchaseItem key={line.value} line={line} />
          ))}
        </ul>
      )}
    </SheetRow>
  )
}

// What it was, then its documents and, on a refunded payment, the refund mark.
function PurchaseItem({ line }: { line: PurchaseLine }) {
  const t = useTranslations('app.account.purchases')
  return (
    <li className="pt-3 pb-1">
      <p className="text-body text-foreground">{line.label}</p>
      <div className="flex flex-wrap items-center gap-x-5">
        {line.receiptHref ? <DocumentLink href={line.receiptHref} text={t('receipt')} of={line.label} /> : <span className="py-2.5 text-caption text-muted-foreground">{t('emailed')}</span>}
        {line.invoiceHref ? <DocumentLink href={line.invoiceHref} text={t('invoice')} of={line.label} /> : null}
        {line.refund ? (
          <span className="ms-auto rounded-full border border-hairline px-2.5 py-0.5 text-caption text-muted-foreground">
            {t(line.refund === 'full' ? 'refunded' : 'partlyRefunded')}
          </span>
        ) : null}
      </div>
    </li>
  )
}

// A plain link, never next/link: prefetching it would ask Stripe for a link nobody clicked.
function DocumentLink({ href, text, of }: { href: string; text: string; of: string }) {
  const t = useTranslations('app.account.purchases')
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('linkLabel', { document: text, purchase: of })}
      className="inline-flex min-h-11 items-center gap-1 text-label font-medium text-primary underline-offset-3 hover:underline focus-visible:underline"
    >
      {text}
      <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-4" />
    </a>
  )
}
