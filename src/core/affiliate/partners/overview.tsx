import { getTranslations } from 'next-intl/server'
import { currentLocale } from '@/core/i18n/server'
import { consumerReferralUrl } from '../consumer-link'
import { Link } from '@/core/i18n/ui'
import { date, money } from './format'
import { CopyLink } from '../copy-link'
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
  const gap = Math.max(0, settings.payout_min_usd - s.available)
  const eligible = gap === 0 && !!account.payout_method && account.status === 'active'
  const progress = Math.min(100, Math.round((s.available / settings.payout_min_usd) * 100))
  const usd = (cents: number) => money(locale, cents)
  const activity = [
    ['clicks', String(s.clicks)],
    ['referred', String(s.referred)],
    ['paidUsers', String(s.paidUsers)],
  ] as const
  const earnings = [
    ['pending', usd(s.pending)],
    ['paid', usd(s.paid)],
  ] as const
  return (
    <div className="af-overview">
      <section className="af-panel af-balance" aria-labelledby="af-balance">
        <h2 id="af-balance" className="af-label">{t('metrics.available')}</h2>
        <p className="af-balance-figure">{usd(s.available)}</p>
        <div className="af-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
          aria-label={t('gap', { threshold: usd(settings.payout_min_usd), gap: usd(gap) })}>
          <span style={{ inlineSize: progress + '%' }} />
        </div>
        <p className="af-balance-line">
          {gap > 0 ? t('gap', { threshold: usd(settings.payout_min_usd), gap: usd(gap) }) : t('thresholdMet', { threshold: usd(settings.payout_min_usd) })}
        </p>
        <dl className="af-balance-facts">
          <div>
            <dt>{t('nextShort')}</dt>
            <dd>{date(locale, s.nextSettlement)}</dd>
          </div>
          <div>
            <dt>{t('maturingShort')}</dt>
            <dd className="af-num">{usd(s.maturing)}</dd>
          </div>
        </dl>
        <p className={eligible ? 'af-success' : 'af-note'}>{eligible ? t('eligible') : account.payout_method ? t('notEligible') : t('needMethod')}</p>
        <Link href="/partners?view=settings" className="af-link">
          {account.payout_method ? t('hasMethod') : t('addMethod')}
        </Link>
      </section>

      <section className="af-panel af-linkbox" aria-labelledby="af-mylink">
        <h2 id="af-mylink">{t('myLink')}</h2>
        <CopyLink url={consumerReferralUrl(account.slug, locale)} copy={t('copy')} copied={t('copied')} />
        <p className="af-hint">{t('anyPage', { suffix: '?ref=' + account.slug })}</p>
      </section>

      <section className="af-stats" aria-label={t('statsLabel')}>
        {[...activity, ...earnings].map(([key, value]) => (
          <div key={key} className="af-stat">
            <span className="af-label">{t('metrics.' + key)}</span>
            <span className="af-stat-value">{value}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
