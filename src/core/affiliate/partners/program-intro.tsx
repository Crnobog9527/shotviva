import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'

export async function ProgramIntro({ children }: { children?: ReactNode }) {
  const t = await getTranslations('affiliate')
  return (
    <section className="af-intro">
      <h1>{t('programName')}</h1>
      <h2>{t('whatTitle')}</h2>
      <p>{t('intro')}</p>
      {children ?? <p role="status">{t('closed')}</p>}
      <h2>{t('benefitsTitle')}</h2>
      <p>{t('benefits')}</p>
      {children && <Link href="/partners/terms" className="af-link">{t('terms')}</Link>}
    </section>
  )
}
