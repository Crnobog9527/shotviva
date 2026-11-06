import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { buttonVariants } from '@/core/ui/button'

// notFound() anywhere under [locale] (an unknown slug, template or photo): the page's own
// language, with the way home and to the templates (DESIGN §4.6).
export default function NotFound() {
  const t = useTranslations('notFound')
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
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
    </main>
  )
}
