import { getTranslations } from 'next-intl/server'
import type { Account } from './models'

export async function ApplicationStatus({ account }: { account: Account }) {
  const t = await getTranslations('affiliate')
  return (
    <section className="af-intro" role="status">
      <h1>{account.status === 'pending' ? t('pendingApplication') : t('status.' + account.status)}</h1>
      {account.status === 'pending' && <p>{t('pendingReview')}</p>}
      {account.status === 'rejected' && account.reject_reason && <p>{account.reject_reason}</p>}
    </section>
  )
}
