'use client'

import { useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Coins } from 'lucide-react'

import type { EnterpriseContact } from '@/core/config'
import { Link } from '@/core/i18n/ui'
import { Button } from '@/core/ui/button'

import type { ConsolePackage, OwnerConsole, PaymentAccountGroup } from '../console/types'
import { unitPricePer100Credits } from '../unit-price'
import { PAYMENT_FIELD_LABELS, PAYMENT_FIELDS, PAYMENT_KIND_LABELS, PAYMENT_KINDS } from '../payment-labels'
import type { OwnerActions } from './actions'
import { RefCodeBox } from './ref-code-box'
import { TransferContactButton } from './transfer-contact'
import { FIELD, Panel, Result, Stat } from './parts'
import { orgShowsPromo } from './promo-visibility'
import { useConsoleAction } from './use-console-action'

// The owner's console, panel by panel (ARCHITECTURE §6.5): pool and deposit, packages, bank
// transfer. The staff-only link is in staff-link-panel.tsx. The members table is in members-panel.tsx.

export function PoolPanel({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.pool')
  const format = useFormatter()
  const promo = orgShowsPromo(data.org)
  return (
    <Panel title={t('title')} hint={t(promo ? 'hint' : 'hintPaidOnly')}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label={t('balance')} value={format.number(data.org.poolCredits)} note={t('unit')} />
        {promo ? <PromoStat org={data.org} /> : null}
      </div>
      {promo ? <p className="text-caption text-muted-foreground">{t('promoHint')}</p> : null}
      {/* Only while the workspace runs do the main admin's purchases go to the pool (2033); with it off
          they stay on their own account and can be spent there (2034). */}
      <p className="text-caption text-muted-foreground">{t(data.org.status === 'active' ? 'purchaseNote' : 'purchaseNoteOff')}</p>
      <MoveInForm data={data} actions={actions} />
    </Panel>
  )
}

function PromoStat({ org }: { org: OwnerConsole['org'] }) {
  const t = useTranslations('app.org.pool')
  const format = useFormatter()
  const until = org.promoExpiresAt ? format.dateTime(new Date(Date.parse(org.promoExpiresAt) - 1), { dateStyle: 'medium', timeZone: 'UTC' }) : null
  return <Stat label={t('promoBalance')} value={format.number(org.promoPoolCredits)} note={until ? t('promoExpires', { at: until }) : t('promoNone')} />
}

// Since 2033 the owner's purchases land in the pool, so moving credits in is only for paid credits
// already on the account: the form shows while there are some (or right after a move, to keep its
// result on screen), and nothing at all otherwise.
function MoveInForm({ data, actions }: { data: OwnerConsole; actions: OwnerActions }) {
  const t = useTranslations('app.org.pool')
  const format = useFormatter()
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState('')
  const { pending, outcome, run } = useConsoleAction()
  if (data.depositable <= 0 && outcome === null) return null
  const value = Number(amount)
  const suspended = data.org.status === 'suspended'
  const blocked = pending || suspended || !(Number.isInteger(value) && value > 0 && value <= data.depositable)
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked) return
        run(() => actions.deposit({ requestId, credits: value }), t('deposited'), () => { setRequestId(crypto.randomUUID()); setAmount('') })
      }}
    >
      <Stat label={t('yours')} value={format.number(data.depositable)} note={t('yoursNote')} />
      {suspended ? <p role="status" className="text-label text-muted-foreground">{t('suspended')}</p> : null}
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('depositLabel')}</span>
        <input className={FIELD} inputMode="numeric" value={amount} placeholder={t('depositPlaceholder')} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 10))} />
      </label>
      <p className="text-caption text-muted-foreground">{t('depositHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="touch" variant="glass" disabled={blocked}><Coins />{pending ? t('depositing') : t('deposit')}</Button>
        <Result outcome={outcome} />
      </div>
    </form>
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

// How to pay: bank transfer to one of the enabled accounts (never a card). The enterprise number
// and the after-transfer note sit in their own panel; each account group gets a panel of its own,
// in PAYMENT_KINDS order (US company first, Owner 2026-11-23). Labels come from the shared tables
// (PAYMENT_*), in the page's language; empty values are skipped. With no groups (or a failed read)
// the panel says to contact us for the details.
export function PaymentAccountsPanel({ groups, orgName, refCode }: { groups: readonly PaymentAccountGroup[] | null; orgName: string; refCode: string }) {
  const t = useTranslations('app.org.payment')
  const lang = useLocale() === 'zh' ? 'zh' : 'en'
  const shown = [...(groups?.filter((group) => group.details && Object.keys(group.details).length > 0) ?? [])]
    .sort((a, b) => PAYMENT_KINDS.indexOf(a.kind) - PAYMENT_KINDS.indexOf(b.kind))
  return (
    <>
      <Panel title={t('title')} hint={t('hint', { org: orgName })}>
        <RefCodeBox code={refCode} />
        {shown.length === 0 ? <p data-slot="org-payment-accounts-pending" className="text-label text-muted-foreground">{t('pending')}</p> : null}
        <p className="text-label text-muted-foreground">{t('after')}</p>
      </Panel>
      {shown.map((group) => (
        <Panel key={group.kind} title={PAYMENT_KIND_LABELS[group.kind][lang]}>
          <dl data-slot="org-payment-account" data-kind={group.kind} className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
            {PAYMENT_FIELDS[group.kind].filter((field) => group.details[field]).map((field) => (
              <div key={field} className="contents">
                <dt className="text-label text-muted-foreground">{PAYMENT_FIELD_LABELS[field]?.[lang] ?? field}</dt>
                <dd className="break-all text-label select-all">{group.details[field]}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ))}
    </>
  )
}
