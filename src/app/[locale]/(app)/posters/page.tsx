import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { Link } from '@/core/i18n/navigation'
import { currentLocale } from '@/core/i18n/server'
import { listPosterTemplates, posterAllowed } from '@/modules/image'

// Dense-text posters (ARCHITECTURE §5.3), invite-only in phase 1: anyone not invited gets a 404.
// One style goes straight to its editor; several are listed.
async function Posters() {
  const user = await requireUser('/posters')
  if (!(await posterAllowed(user.id))) notFound()
  const [templates, t, locale] = await Promise.all([listPosterTemplates(createAdminSupabase(), await currentLocale()), getTranslations('app.poster'), currentLocale()])
  if (templates.length === 1) redirect(`/${locale === 'en' ? '' : `${locale}/`}posters/${templates[0]!.id}`)
  return (
    <>
      <FlowNav back={{ href: '/generate', label: t('back') }} title={t('title')} />
      <ul className="grid gap-3">
        {templates.map((template) => (
          <li key={template.id}>
            <Link href={`/posters/${template.id}`} className="grid min-h-16 gap-1 rounded-card bg-card p-4 hairline">
              <b className="text-body">{template.name}</b>
              {template.description ? <span className="text-caption text-muted-foreground">{template.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {templates.length === 0 ? <p className="text-caption text-muted-foreground">{t('noStyles')}</p> : null}
    </>
  )
}

export default function PostersPage() {
  return (
    <AppPage>
      <Suspense fallback={null}>
        <Posters />
      </Suspense>
    </AppPage>
  )
}
