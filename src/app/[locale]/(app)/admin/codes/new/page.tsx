import { randomUUID } from 'node:crypto'

import { AdminPage } from '@/core/admin'
import { CODE_EDITOR_COPY, CodeEditor } from '@/core/admin/code-editor'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { campaignCatalog } from '@/core/codes/admin'
import { readGiftPolicy } from '@/core/codes/server'
import { currentProducts } from '@/site/billing/display-products'
import { submitCampaignCode } from '../save'

export const instant = false
export const metadata = { title: CODE_EDITOR_COPY.create }

export default async function NewCampaignPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [policy, products] = await Promise.all([readGiftPolicy(db), currentProducts(db)])
  return <AdminPage title={CODE_EDITOR_COPY.create}><CodeEditor id={randomUUID()} existing={null}
    prices={campaignCatalog(products)} policy={policy} save={submitCampaignCode} /></AdminPage>
}
