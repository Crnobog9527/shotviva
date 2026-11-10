import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { localizePath } from '@/core/i18n/paths'
import { appOrigin } from '@/core/site-url'
import { CommissionList } from './commission-list'
import { date, money } from './format'
import { CopyLink } from '../copy-link'
import type { Account, Query } from './models'
import { readMembers, readPayouts, readReferrals } from './repository'
import { More, StatusPill, Table } from './shared-ui'

type Props = { user: string; query: Query }
export async function ReferralList({ user, query }: Props) {
  const [page, t, locale] = await Promise.all([
    readReferrals(user, query.cursor),
    getTranslations('affiliate'),
    currentLocale(),
  ])
  return (
    <section className="af-section">
      <h2>{t('nav.referrals')}</h2>
      <Table
        headers={['customer', 'bound', 'purchases', 'totalCommission'].map((k) => t(k))}
        empty={t('empty')}
        rows={page.items.map((r) => [r.mask, date(locale, r.date), r.count, money(locale, r.amount)])}
      />
      <More query={query} next={page.nextCursor} />
    </section>
  )
}
export async function PayoutList({ user, query }: Props) {
  const [page, t, locale] = await Promise.all([
    readPayouts(user, query.cursor),
    getTranslations('affiliate'),
    currentLocale(),
  ])
  return (
    <section className="af-section">
      <h2>{t('nav.payouts')}</h2>
      <Table
        headers={['period', 'statementAmount', 'amountPaid', 'state', 'paidDate'].map((k) => t(k))}
        empty={t('empty')}
        rows={page.items.map((r) => [
          date(locale, r.period),
          money(locale, r.amount),
          r.status === 'paid' ? money(locale, r.paid_amount ?? r.amount) : '—',
          <StatusPill key="s" status={r.status} t={t} />,
          r.paid_at ? date(locale, r.paid_at) : '—',
        ])}
      />
      <More query={query} next={page.nextCursor} />
    </section>
  )
}
export async function TeamReport({ user, query, account }: Props & { account: Account }) {
  const [page, t, locale] = await Promise.all([
    readMembers(user, query.cursor),
    getTranslations('affiliate'),
    currentLocale(),
  ])
  const url = new URL(localizePath('/partners/apply', locale), appOrigin)
  url.searchParams.set('by', account.slug)
  return (
    <>
      <section className="af-section">
        <div className="af-panel af-linkbox">
          <h2>{t('recruit')}</h2>
          <CopyLink url={url.href} copy={t('copy')} copied={t('copied')} />
          <p className="af-hint">{t('recruitHint')}</p>
        </div>
        <h2>{t('members')}</h2>
        <Table
          headers={['member', 'joined', 'state'].map((k) => t(k))}
          empty={t('empty')}
          rows={page.items.map((r) => [<code key="c" className="af-code">{r.slug}</code>, date(locale, r.created_at), <StatusPill key="s" status={r.status} t={t} />])}
        />
        <More query={query} next={page.nextCursor} />
      </section>
      <CommissionList user={user} query={query} team />
    </>
  )
}
