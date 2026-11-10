import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'

export async function ProgramIntro({ children, loading = false }: { children?: ReactNode; loading?: boolean }) {
  const t = await getTranslations('affiliate')
  return (
    <section className="af-intro">
      <h1>{t('programName')}</h1>
      <h2>{t('whatTitle')}</h2>
      <p>{t('intro')}</p>
      {loading ? <div className="af-entry-actions min-h-11" aria-hidden /> : children ?? <p role="status">{t('closed')}</p>}
      <h2>{t('benefitsTitle')}</h2>
      <p>{t('benefits')}</p>
      {children && <Link href="/partners/terms" className="af-link">{t('terms')}</Link>}
    </section>
  )
}
