import { providerFloor } from '@/core/templates/provider-pricing'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EDIT_TEMPLATE_COPY, EditTemplateEditor, loadEditTemplateSettings } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { readTemplateFloors } from '../pricing'

import { saveEditTemplateAction } from './actions'

// Admin-only, request-time page for the built-in photo-edit template (ARCHITECTURE §5.2). The
// proxy 404s non-admins first; requireAdmin() stays the authoritative check.
export const instant = false

export const metadata: Metadata = { title: EDIT_TEMPLATE_COPY.title }

export default async function AdminEditTemplatePage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [settings, floor] = await Promise.all([loadEditTemplateSettings(db), readTemplateFloors(db)])
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <Link href="/admin/templates" className="text-muted-foreground text-sm">
        {EDIT_TEMPLATE_COPY.back}
      </Link>
      <h1 className="text-xl font-semibold">{EDIT_TEMPLATE_COPY.title}</h1>
      <EditTemplateEditor settings={settings} floor={providerFloor(floor, null, 'edit')} save={saveEditTemplateAction} />
    </div>
  )
}
