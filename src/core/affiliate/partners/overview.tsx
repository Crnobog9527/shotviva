import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { localizePath } from '@/core/i18n/paths'
import { Link } from '@/core/i18n/ui'
import { appOrigin } from '@/core/site-url'
import { date, money } from './format'
import { CopyLink } from './interactive'
import type { Account, Settings } from './models'
import { readSummary } from './repository'

export async function Overview({
  user,
  account,
  settings,
}: {
  user: string
  account: Account
  settings: Settings
}) {
  const [s, t, locale] = await Promise.all([readSummary(user), getTranslations('affiliate'), currentLocale()])
  const url = new URL(localizePath('/', locale), appOrigin)
  url.searchParams.set('ref', account.slug)
  const gap = Math.max(0, settings.payout_min_usd - s.available)
  const eligible = gap === 0 && !!account.payout_method && account.status === 'active'
  const moneyHere = (cents: number) => money(locale, cents)
  const stats = [
    ['clicks', s.clicks],
    ['referred', s.referred],
    ['paidUsers', s.paidUsers],
    ['pending', moneyHere(s.pending)],
    ['available', moneyHere(s.available)],
    ['paid', moneyHere(s.paid)],
  ] as const
  return (
    <>
      <section className="af-section">
        <h2>{t('myLink')}</h2>
        <CopyLink url={url.href} copy={t('copy')} copied={t('copied')} />
        <p>{t('anyPage', { suffix: '?ref=' + account.slug })}</p>
      </section>
      <dl className="af-metrics">
        {stats.map(([key, value]) => (
          <div key={key}>
            <dt>{t('metrics.' + key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section className="af-panel">
        <h2>{t('next', { date: date(locale, s.nextSettlement) })}</h2>
        <p>{eligible ? t('eligible') : t('notEligible')}</p>
        <p>{t('gap', { threshold: moneyHere(settings.payout_min_usd), gap: moneyHere(gap) })}</p>
        <p>{t('maturing', { amount: moneyHere(s.maturing) })}</p>
        <Link href="/partners?view=settings" className="af-link">
          {account.payout_method ? t('hasMethod') : t('addMethod')}
        </Link>
      </section>
    </>
  )
}
