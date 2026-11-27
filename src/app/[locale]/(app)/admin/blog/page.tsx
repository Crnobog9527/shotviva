import type { Metadata } from 'next'

import { AdminPage, BlogList, BLOG_COPY, listAdminPosts } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Admin-only, request-time page (ARCHITECTURE §10). The admin layout gates it too.
export const instant = false

export const metadata: Metadata = { title: BLOG_COPY.title }

export default async function AdminBlogPage({ searchParams }: PageProps<'/[locale]/admin/blog'>) {
  await requireAdmin()
  const { cursor } = await searchParams
  const page = await listAdminPosts(createAdminSupabase(), typeof cursor === 'string' ? cursor : null)
  return (
    <AdminPage title={BLOG_COPY.title}>
      <BlogList rows={page.items} nextHref={page.nextCursor ? `/admin/blog?cursor=${page.nextCursor}` : null} />
    </AdminPage>
  )
}
