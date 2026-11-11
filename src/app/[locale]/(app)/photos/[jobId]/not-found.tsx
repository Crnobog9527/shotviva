import { useTranslations } from 'next-intl'

import { AppPage } from '@/core/app-shell'
import { Link } from '@/core/i18n/ui'
import { EmptyState, STATE_GHOST } from '@/core/ui/empty-state'

// A photo that is not there (deleted, someone else's, a bad link), inside the app shell
// (design/comps-v3-b/empty.html?v=404) instead of the marketing 404.
export default function PhotoNotFound() {
  const t = useTranslations('app.states.photoMissing')
  return (
    <AppPage>
      <EmptyState
        icon="missing"
        title={t('title')}
        body={t('body')}
        action={
          <Link href="/photos" className={STATE_GHOST}>
            {t('back')}
          </Link>
        }
      />
    </AppPage>
  )
}
