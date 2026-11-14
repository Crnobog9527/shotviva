import type { Metadata } from 'next'
import Link from 'next/link'

import { EDIT_TEMPLATE_COPY, EditTemplateEditor, loadEditTemplateSettings } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { pricingFromOptions } from '@/core/admin/templates'
import { ModelSyncProvider } from '@/core/admin/image-provider-field/model-sync'
import { syncTemplateModel } from '../sync-model-action'
import { readPricingOptions } from '@/site/template-pricing'

import { setTemplateSaleAction } from '../sale-action'
import { saveEditTemplateAction } from './actions'

// Admin-only, request-time page for the built-in photo-edit template (ARCHITECTURE §5.2). The
// proxy 404s non-admins first; requireAdmin() stays the authoritative check.
export const instant = false

export const metadata: Metadata = { title: EDIT_TEMPLATE_COPY.title }

export default async function AdminEditTemplatePage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [settings, providers] = await Promise.all([loadEditTemplateSettings(db), readPricingOptions(db)])
  const floor = pricingFromOptions(providers)
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <Link href="/admin/templates" className="text-muted-foreground text-sm">
        {EDIT_TEMPLATE_COPY.back}
      </Link>
      <h1 className="text-xl font-semibold">{EDIT_TEMPLATE_COPY.title}</h1>
      {/* 「出图模型」 shows the chosen line's (else the default line's) capability sync, as the template editor does. */}
      <ModelSyncProvider action={syncTemplateModel}>
        <EditTemplateEditor settings={settings} floors={floor} providers={providers} setSale={setTemplateSaleAction} save={saveEditTemplateAction} />
      </ModelSyncProvider>
    </div>
  )
}
