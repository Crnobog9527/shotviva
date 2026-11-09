import { randomUUID } from 'node:crypto'

import { AdminPage } from '@/core/admin'
import { CODE_EDITOR_COPY, CodeEditor } from '@/core/admin/code-editor'
import { readGiftPolicy } from '@/core/admin/code-editor/read'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { campaignCatalog } from '@/core/codes/admin'
import { site } from '@/site/site.config'
import { submitCampaignCode } from '../save'

export const instant = false
export const metadata = { title: CODE_EDITOR_COPY.create }

export default async function NewCampaignPage() {
  await requireAdmin()
  const policy = await readGiftPolicy(createAdminSupabase())
  return <AdminPage title={CODE_EDITOR_COPY.create}><CodeEditor id={randomUUID()} existing={null}
    prices={campaignCatalog(site.billing.products)} policy={policy} save={submitCampaignCode} /></AdminPage>
}
