import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { isAffiliateEnabled } from '../feature'
import { isOrgMember } from './repository'

// Placeholder for the enterprise affiliate view (ARCHITECTURE §6.5): org owners and members land
// here instead of the personal program. The real dashboard lives in the account centre (card E4).
export async function EnterpriseScreen() {
  await connection()
  if (!(await isAffiliateEnabled())) notFound()
  const user = await getSessionUser()
  if (!user?.verified || !(await isOrgMember(user.id))) redirect(await localized('/partners/join'))
  const t = await getTranslations('affiliate')
  return (
    <div className="af-apply">
      <section className="af-panel af-gate" role="status">
        <span className="af-pill af-pill-ok">{t('enterprise.pill')}</span>
        <h1>{t('enterprise.title')}</h1>
        <p>{t('enterprise.body')}</p>
        <Link href="/account" className="af-link">{t('backToAccount')}</Link>
      </section>
    </div>
  )
}
