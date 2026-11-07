import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { isWishlistEnabled, listAdminRequests, listTemplateOptions } from '@/core/wishlist'
import { REQUESTS_COPY, RequestsReview } from '@/core/wishlist/admin-ui'
import { site } from '@/site/site.config'

import { reviewRequestAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §10 page 2). The proxy answers non-admins with a
// real 404; requireAdmin() stays the authoritative check. 404 too while the wishlist is
// switched off (§15.6). noindex comes from the (app) layout.
export const instant = false

export const metadata: Metadata = { title: REQUESTS_COPY.title }

export default async function AdminRequestsPage() {
  if (!(await isWishlistEnabled(site))) notFound()
  await requireAdmin()
  const db = createAdminSupabase()
  const [requests, templates] = await Promise.all([listAdminRequests({ db, store: r2Store() }), listTemplateOptions(db)])
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-6">
      <h1 className="text-xl font-semibold">{REQUESTS_COPY.title}</h1>
      <RequestsReview requests={requests} templates={templates} actions={{ review: reviewRequestAction }} />
    </div>
  )
}
