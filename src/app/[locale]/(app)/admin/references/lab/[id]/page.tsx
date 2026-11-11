import { notFound } from 'next/navigation'
import { z } from 'zod'

import { PromptLab } from '@/core/admin/prompt-lab-ui/prompt-lab'
import { copy } from '@/core/admin/prompt-lab-ui/copy'
import { loadPublishOptions } from '@/core/admin/prompt-lab/publish-options'
import { labSession, readLabRuns, readLabVersions } from '@/core/admin/prompt-lab/store'
import { AdminPage } from '@/core/admin/shell'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { Link } from '@/core/i18n/navigation'
import { listProviders } from '@/core/providers'
import { r2Store } from '@/core/storage'
import { isPromptLabVisionProvider, loadPanelSummary } from '@/modules/image'

export const instant = false
export const metadata = { title: copy.title }

export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()
  const db = createAdminSupabase()
  const session = await labSession(db, id.data)
  if (!session) notFound()
  const [versions, runs, providers, summary, publish] = await Promise.all([
    readLabVersions(db, id.data), readLabRuns(db, id.data), listProviders(db), loadPanelSummary({ db, store: r2Store() }),
    loadPublishOptions(db, { id: session.asset_id, categoryId: session.reference_assets.category_id }),
  ])
  const models = {
    image: providers.filter(p => p.module === 'image' && p.apiKeyLast4 && p.capabilities).map(p => ({
      id: p.id, label: p.label + ' · ' + p.model, resolutions: p.resolutions.filter(r => p.capabilities?.resolutions.includes(r)),
      fixedQuality: p.adapter === 'openrouter_images',
    })).filter(p => p.resolutions.length > 0),
    vision: providers.filter(isPromptLabVisionProvider).map(p => ({ id: p.id, label: p.label + ' · ' + p.model })),
  }
  return <AdminPage title={copy.title} actions={<Link href="/admin/references">{copy.back}</Link>}>
    <PromptLab key={id.data} sessionId={id.data} assetId={session.asset_id} archived={session.reference_assets.status === 'archived'}
      initial={{ versions, runs }} summary={summary} models={models} publish={publish} />
  </AdminPage>
}
