import { useTranslations } from 'next-intl'

// One line under a finished photo's Edit button (Owner 2026-11-08): new users did not know what
// an edit can do, so it names the common jobs. Shared by the workspace done state and the photo page.
export function EditHint() {
  const t = useTranslations('app.edit')
  return <p className="text-caption text-muted-foreground">{t('discover')}</p>
}
