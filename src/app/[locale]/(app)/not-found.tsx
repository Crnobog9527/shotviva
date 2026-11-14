import { getTranslations } from 'next-intl/server'

import { Link } from '@/core/i18n/ui'
import { EmptyState, STATE_GHOST } from '@/core/ui/empty-state'

// notFound() inside the app (an unknown template, a disabled section, the admin for a member):
// the 404 as an empty state inside the app shell, so the tab bar and the way back stay. It used
// to fall to [locale]/not-found.tsx, the marketing 404 under the bare root layout, whose
// stylesheets every page then carried a copy of in its HTML (inlineCss).
export default async function AppNotFound() {
  const t = await getTranslations('notFound')
  return (
    <EmptyState
      icon="missing"
      title={t('title')}
      body={t('body')}
      action={
        <Link href="/generate" className={STATE_GHOST}>
          {t('templates')}
        </Link>
      }
    />
  )
}
