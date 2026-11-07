import type { Metadata } from 'next'
import Link from 'next/link'

import { listAdminTemplates, TemplatesEditor } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { CREDITS_FLOOR } from '@/modules/image'

import {
  applyCoverAction,
  reorderTemplatesAction,
  setFeaturedTemplatesAction,
  requestCoverUploadAction,
  saveTemplateAction,
  setTemplateActiveAction,
  setTemplatesActiveAction,
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
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">模板与提示词</h1>
        {/* The built-in photo-edit template is not in this list (ARCHITECTURE §5.2). */}
        <Link href="/admin/templates/edit" className="ml-auto text-sm underline underline-offset-4">
          作品编辑的判断题和约束段落 →
        </Link>
      </div>
      <TemplatesEditor
        templates={templates}
        floor={CREDITS_FLOOR}
        actions={{
          save: saveTemplateAction,
          setActive: setTemplateActiveAction,
          setActiveMany: setTemplatesActiveAction,
          reorder: reorderTemplatesAction,
          setFeatured: setFeaturedTemplatesAction,
          requestCoverUpload: requestCoverUploadAction,
          applyCover: applyCoverAction,
        }}
      />
    </div>
  )
}
