import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { EmptyState, STATE_GHOST } from '@/core/ui/empty-state'

import { CATEGORY_PARAM } from '../catalogue/catalogue-filter'

// A template link whose template is published but held back from sale for now (Owner
// 2026-11-14): "temporarily unavailable" instead of a 404, and the way to its category on
// Create. Never why: no price or cost words. The app layout keeps it noindex.
export function TemplateUnavailable({ categoryPath }: { categoryPath: readonly string[] }) {
  const t = useTranslations('app.states.templateUnavailable')
  const href = categoryPath.length ? `/generate?${CATEGORY_PARAM}=${categoryPath.join('/')}` : '/generate'
  return (
    <EmptyState
      icon="missing"
      title={t('title')}
      body={t('body')}
      action={
        <Link href={href} className={STATE_GHOST}>
          {t('similar')}
        </Link>
      }
    />
  )
}
