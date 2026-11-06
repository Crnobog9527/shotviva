import type { Metadata } from 'next'

import { AdminPage, listAdminTemplates, TemplatesEditor } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { CREDITS_FLOOR } from '@/modules/image'

import {
  applyCoverAction,
  reorderTemplatesAction,
  requestCoverUploadAction,
  saveTemplateAction,
  setTemplateActiveAction,
} from './actions'

// Admin-only, request-time page. The proxy (core/auth proxyGate) answers non-admins with a real
// 404 before rendering; requireAdmin() here stays as the authoritative check. noindex comes from
// the (app) layout.
export const instant = false

export const metadata: Metadata = { title: '模板与提示词' }

export default async function AdminTemplatesPage() {
  await requireAdmin()
  const templates = await listAdminTemplates(createAdminSupabase())
  return (
    <AdminPage title={'模板与提示词'}>
      <TemplatesEditor
        templates={templates}
        floor={CREDITS_FLOOR}
        actions={{
          save: saveTemplateAction,
          setActive: setTemplateActiveAction,
          reorder: reorderTemplatesAction,
          requestCoverUpload: requestCoverUploadAction,
          applyCover: applyCoverAction,
        }}
      />
    </AdminPage>
  )
}
