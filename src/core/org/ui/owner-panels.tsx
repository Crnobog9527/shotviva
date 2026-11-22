'use client'

import { useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Coins } from 'lucide-react'

import type { EnterpriseContact } from '@/core/config'
import { Link } from '@/core/i18n/ui'
import { Button } from '@/core/ui/button'

import type { ConsolePackage, OwnerConsole, PaymentAccountGroup } from '../console/types'
import { unitPricePer100Credits } from '../unit-price'
import { PAYMENT_FIELD_LABELS, PAYMENT_FIELDS, PAYMENT_KIND_LABELS } from '../payment-labels'
import type { OwnerActions } from './actions'
import { RefCodeBox } from './ref-code-box'
import { TransferContactButton } from './transfer-contact'
import { FIELD, Panel, Result, Stat } from './parts'
import { useConsoleAction } from './use-console-action'

// The owner's console, panel by panel (ARCHITECTURE §6.5): pool and deposit, packages, bank
// transfer. The staff-only link is in staff-link-panel.tsx. The members table is in members-panel.tsx.

export function PoolPanel({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.pool')
  const format = useFormatter()
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState('')
  const { pending, outcome, run } = useConsoleAction()
  const value = Number(amount)
  const valid = Number.isInteger(value) && value > 0 && value <= data.depositable
  const suspended = data.org.status === 'suspended'
  return (
    <Panel title={t('title')} hint={t('hint')}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label={t('balance')} value={format.number(data.org.poolCredits)} note={t('unit')} />
        <Stat label={t('promoBalance')} value={format.number(data.org.promoPoolCredits)}
          note={data.org.promoExpiresAt ? t('promoExpires', { at: format.dateTime(new Date(Date.parse(data.org.promoExpiresAt) - 1), { dateStyle: 'medium', timeZone: 'UTC' }) }) : t('promoNone')} />
        <Stat label={t('yours')} value={format.number(data.depositable)} note={t('yoursNote')} />
      </div>
      <p className="text-caption text-muted-foreground">{t('promoHint')}</p>
      {suspended ? <p role="status" className="text-label text-destructive">{t('suspended')}</p> : null}
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (pending || !valid || suspended) return
          run(() => actions.deposit({ requestId, credits: value }), t('deposited'), () => { setRequestId(crypto.randomUUID()); setAmount('') })
        }}
      >
        <label className="grid gap-1 text-label">
          <span className="font-medium">{t('depositLabel')}</span>
          <input className={FIELD} inputMode="numeric" value={amount} placeholder={t('depositPlaceholder')} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 10))} />
        </label>
        <p className="text-caption text-muted-foreground">{t('depositHint')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="touch" variant="glass" disabled={pending || !valid || suspended}><Coins />{pending ? t('depositing') : t('deposit')}</Button>
          <Result outcome={outcome} />
        </div>
      </form>
    </Panel>
  )
}

function Unit({ t, cents, credits }: { t: ReturnType<typeof useTranslations>; cents: number; credits: number }) {
  const unit = unitPricePer100Credits(cents, credits)
  return unit === null ? null : <span className="block text-caption text-muted-foreground">{t('unitPrice', { price: unit })}</span>
}

function price(format: ReturnType<typeof useFormatter>, cents: number) {
  return format.number(cents / 100, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })
}

// Prices are in US dollars, shown only: the order goes through us offline (wire transfer).
export function PackagesPanel({ packages, contact }: { packages: readonly ConsolePackage[]; contact?: EnterpriseContact }) {
  const t = useTranslations('app.org.packages')
  const format = useFormatter()
  return (
    <Panel title={t('title')} hint={t('hint')}>
      {packages.length === 0 ? <p className="text-label text-muted-foreground">{t('none')}</p> : (
        <ul className="divide-y divide-hairline">
          {packages.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-3">
              <span className="min-w-0 font-medium">{p.name}</span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="font-semibold">{price(format, p.priceUsdCents)}</span>
                <span className="block text-caption text-muted-foreground">{t('credits', { count: p.credits })}</span>
                <Unit t={t} cents={p.priceUsdCents} credits={p.credits} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-label text-muted-foreground">{t('contact')}</p>
      {contact ? <TransferContactButton contact={contact} /> : (
        <Link href="/account?help=new" className="inline-flex min-h-11 items-center text-label font-medium text-primary underline underline-offset-4">{t('contactLink')}</Link>
      )}
    </Panel>
  )
}

// How to pay: bank transfer to one of the enabled accounts (never a card). Labels come from the
// shared tables (PAYMENT_*), in the page's language; empty values are skipped. With no groups (or a
// failed read) the panel says to contact us for the details.
export function PaymentAccountsPanel({ groups, orgName, refCode }: { groups: readonly PaymentAccountGroup[] | null; orgName: string; refCode: string }) {
  const t = useTranslations('app.org.payment')
  const lang = useLocale() === 'zh' ? 'zh' : 'en'
  const shown = groups?.filter((group) => group.details && Object.keys(group.details).length > 0) ?? []
  return (
    <Panel title={t('title')} hint={t('hint', { org: orgName })}>
      <RefCodeBox code={refCode} />
      {shown.length === 0 ? <p data-slot="org-payment-accounts-pending" className="text-label text-muted-foreground">{t('pending')}</p> : null}
      {shown.map((group) => (
        <div key={group.kind} className="space-y-2">
          <h3 className="font-medium">{PAYMENT_KIND_LABELS[group.kind][lang]}</h3>
          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
            {PAYMENT_FIELDS[group.kind].filter((field) => group.details[field]).map((field) => (
              <div key={field} className="contents">
                <dt className="text-label text-muted-foreground">{PAYMENT_FIELD_LABELS[field]?.[lang] ?? field}</dt>
                <dd className="break-all text-label select-all">{group.details[field]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="text-label text-muted-foreground">{t('after')}</p>
    </Panel>
  )
}
