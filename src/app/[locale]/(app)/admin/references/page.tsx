import { after } from 'next/server'

import { ReferenceLibrary } from '@/core/admin/reference-library-ui'
import { drainReferenceDeletions } from '@/core/admin/reference-library/object-cleanup'
import { referenceCategories, referencePage } from '@/core/admin/reference-library/read'
import { AdminPage, SHELL_COPY } from '@/core/admin/shell'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

export const instant = false
export const metadata = { title: SHELL_COPY.nav.references }

export default async function AdminReferencesPage() {
  const admin = await requireAdmin()
  const db = createAdminSupabase()
  const [categories, initialPage] = await Promise.all([referenceCategories(db), referencePage(db, {})])
  after(async () => { await drainReferenceDeletions(db, admin.id) })
  return <AdminPage title={SHELL_COPY.nav.references}>
    <ReferenceLibrary categories={categories} initialPage={initialPage} />
  </AdminPage>
}
