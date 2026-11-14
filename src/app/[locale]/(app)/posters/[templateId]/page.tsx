import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { posterDialogPath } from '@/modules/image'

type RouteProps = { params: Promise<{ templateId: string }> }

// The old poster editor page (ARCHITECTURE §5.3; Owner 2026-11-14: the editor is a dialog on
// Create, not a page). Its links (shared, bookmarked, Photos before this change) open Create
// with that template's editor dialog; Create signs a visitor in first and comes back to it.
async function ToDialog({ params }: RouteProps): Promise<null> {
  const [{ templateId }, locale] = await Promise.all([params, currentLocale()])
  redirect(localizePath(posterDialogPath(templateId), locale))
}

export default function PosterStudioPage({ params }: PageProps<'/[locale]/posters/[templateId]'>) {
  return (
    <Suspense fallback={null}>
      <ToDialog params={params} />
    </Suspense>
  )
}
