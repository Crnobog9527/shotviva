import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import type { Account } from './models'

// Pending, declined, suspended or banned: what happened and what the person can do next.
export async function ApplicationStatus({ account }: { account: Account }) {
  const t = await getTranslations('affiliate')
  const key = account.status === 'pending' ? 'pending' : account.status
  return (
    <div className="af-apply">
      <section className="af-panel af-gate" role="status">
        <span className={'af-pill af-pill-' + (key === 'pending' ? 'wait' : 'stop')}>{t('statusScreen.' + key + '.pill')}</span>
        <h1>{t('statusScreen.' + key + '.title')}</h1>
        <p>{t('statusScreen.' + key + '.body')}</p>
        {account.status === 'rejected' && account.reject_reason && (
          <blockquote className="af-reason">
            <span>{t('reason')}</span>
            {account.reject_reason}
          </blockquote>
        )}
        <Link href="/account" className="af-link">{t('backToAccount')}</Link>
      </section>
    </div>
  )
}
