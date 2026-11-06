import type { Metadata } from 'next'

import { AdminPage, FEATURES_COPY, FeaturesEditor, listFeatureSettings } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { saveFeatureAccessAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §6.2 新功能抢先用, §10). The admin layout gates it too.
export const instant = false

export const metadata: Metadata = { title: FEATURES_COPY.title }

export default async function AdminFeaturesPage() {
  await requireAdmin()
  const settings = await listFeatureSettings(createAdminSupabase())
  return (
    <AdminPage title={FEATURES_COPY.title}>
      <FeaturesEditor settings={settings} actions={{ save: saveFeatureAccessAction }} />
    </AdminPage>
  )
}
