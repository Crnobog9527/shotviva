import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage } from '@/core/admin'
import { listReviewWorks, REVIEW_COPY, REVIEW_TABS, type ReviewTab } from '@/core/admin/gallery-review'
import { ReviewBoard } from '@/core/admin/gallery-review-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { siteHasGallery } from '@/core/gallery'
import { r2Store } from '@/core/storage'
import { site } from '@/site/site.config'

import { decideWorksAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §9 第 5 条, T108). It works while the gallery is
// still closed, so works are reviewed before the Owner opens it; 404 only on a site without one.
export const instant = false

export const metadata: Metadata = { title: REVIEW_COPY.title }

const tabOf = (raw: unknown): ReviewTab => (REVIEW_TABS as readonly unknown[]).includes(raw) ? (raw as ReviewTab) : 'pending'

export default async function AdminGalleryPage({ searchParams }: PageProps<'/[locale]/admin/gallery'>) {
  if (!siteHasGallery(site)) notFound()
  await requireAdmin()
  const query = await searchParams
  const after = typeof query.after === 'string' ? query.after : null
  const page = await listReviewWorks({ db: createAdminSupabase(), store: r2Store() }, tabOf(query.tab), after)
  return (
    <AdminPage title={REVIEW_COPY.title}>
      <ReviewBoard page={page} actions={{ decide: decideWorksAction }} />
    </AdminPage>
  )
}
