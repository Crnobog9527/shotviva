import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import { applyPath } from './application-entry'
import type { Account } from './models'

// Pending, declined, suspended or banned: what happened and what the person can do next.
export async function ApplicationStatus({ account, parent }: { account: Account; parent: string }) {
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
        {key === 'rejected' && account.reapply_allowed && (
          <Link className="af-button" href={applyPath(parent)}>{t('reapply')}</Link>
        )}
        <Link href="/account" className="af-link">{t('backToAccount')}</Link>
      </section>
    </div>
  )
}
