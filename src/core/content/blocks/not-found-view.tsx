import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { PROBLEM_GHOST, PROBLEM_PRIMARY, ProblemView } from './problem-view'

// The 404 in the page's language (DESIGN §4.6: the way home and to the templates). Used by
// app/[locale]/not-found.tsx, the global 404 and the /[locale]/page-not-found page the proxy
// rewrites unknown /zh addresses to. `templates`: the three templates to try instead.
export function NotFoundView({ templates }: { templates?: ReactNode }) {
  const t = useTranslations('notFound')
  return (
    <ProblemView
      code="404"
      heading={{ lead: t('heading'), emphasis: t('headingEm') }}
      body={t('body')}
      actions={
        <>
          <Link href="/" className={PROBLEM_PRIMARY}>
            {t('home')}
          </Link>
          <Link href="/#templates" className={PROBLEM_GHOST}>
            {t('templates')}
          </Link>
        </>
      }
    >
      {templates}
    </ProblemView>
  )
}
