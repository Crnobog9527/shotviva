import type { Metadata } from 'next'

import { AdminPage, ANNOUNCEMENTS_COPY, AnnouncementsEditor, listAnnouncements } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { saveAnnouncementAction, setAnnouncementActiveAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §10). The admin layout gates it too.
export const instant = false

export const metadata: Metadata = { title: ANNOUNCEMENTS_COPY.title }

export default async function AdminAnnouncementsPage({ searchParams }: PageProps<'/[locale]/admin/announcements'>) {
  await requireAdmin()
  const { cursor } = await searchParams
  const page = await listAnnouncements(createAdminSupabase(), typeof cursor === 'string' ? cursor : null)
  return (
    <AdminPage title={ANNOUNCEMENTS_COPY.title}>
      <AnnouncementsEditor
        rows={page.items}
        nextHref={page.nextCursor ? `/admin/announcements?cursor=${page.nextCursor}` : null}
        now={page.readAt}
        actions={{ save: saveAnnouncementAction, setActive: setAnnouncementActiveAction }}
      />
    </AdminPage>
  )
}
