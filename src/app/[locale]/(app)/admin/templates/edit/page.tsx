import { providerFloor } from '@/core/templates/provider-pricing'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EDIT_TEMPLATE_COPY, EditTemplateEditor, loadEditTemplateSettings } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { pricingFromOptions } from '@/core/admin/templates'
import { ModelSyncProvider, ModelSyncStatus } from '@/core/admin/image-provider-field/model-sync'
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
  const active = providers.find(provider => provider.isActive)
  const floor = pricingFromOptions(providers)
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <Link href="/admin/templates" className="text-muted-foreground text-sm">
        {EDIT_TEMPLATE_COPY.back}
      </Link>
      <h1 className="text-xl font-semibold">{EDIT_TEMPLATE_COPY.title}</h1>
      {active && !active.openAI && !active.fixedCapabilities && <ModelSyncProvider action={syncTemplateModel}>
        <ModelSyncStatus key={active.id + active.model + active.capabilities?.fetchedAt} provider={active} />
      </ModelSyncProvider>}
      <EditTemplateEditor settings={settings} floor={providerFloor(floor, null, 'edit')} setSale={setTemplateSaleAction} save={saveEditTemplateAction} />
    </div>
  )
}
