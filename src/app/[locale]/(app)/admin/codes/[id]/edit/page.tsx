import { notFound } from 'next/navigation'

import { AdminPage } from '@/core/admin'
import { CODE_EDITOR_COPY, CodeEditor, readEditableCode } from '@/core/admin/code-editor'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { campaignCatalog } from '@/core/codes/admin'
import { readGiftPolicy } from '@/core/codes/server'
import { currentProducts } from '@/site/billing/display-products'
import { submitCampaignCode } from '../../save'

export const instant = false
export const metadata = { title: CODE_EDITOR_COPY.edit }

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminSupabase()
  const [code, policy, products] = await Promise.all([readEditableCode(db, id), readGiftPolicy(db), currentProducts(db)])
  if (!code) notFound()
  return <AdminPage title={CODE_EDITOR_COPY.edit}><CodeEditor id={id} existing={code}
    prices={campaignCatalog(products)} policy={policy} save={submitCampaignCode} /></AdminPage>
}
