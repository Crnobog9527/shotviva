import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { buttonVariants } from '../../ui/button'

// The 404 text in the page's language, with the way home and to the templates (DESIGN §4.6).
// Used by app/[locale]/not-found.tsx and by the /[locale]/page-not-found page the proxy rewrites
// unknown /zh addresses to.
export function NotFoundView() {
  const t = useTranslations('notFound')
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 p-6 py-16 text-center">
      <p className="font-mono text-caption text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="max-w-sm text-muted-foreground">{t('body')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonVariants({ variant: 'glass', size: 'touch' })}>
          {t('home')}
        </Link>
        <Link href="/generate" className={buttonVariants({ size: 'touch' })}>
          {t('templates')}
        </Link>
      </div>
    </section>
  )
}
