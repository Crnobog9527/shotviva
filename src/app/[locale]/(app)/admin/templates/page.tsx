import type { Metadata } from 'next'
import { Suspense } from 'react'

import { TestPanelSummaryProvider } from '@/core/admin/test-run-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { preparePanelSummary } from '@/modules/image'

import { Catalogue, loadCatalogue } from './catalogue'
import { PhotoPreloads } from './photo-preloads'

// Admin-only, request-time page. The proxy (core/auth proxyGate) answers non-admins with a real
// 404 before rendering; requireAdmin() here stays as the authoritative check. noindex comes from
// the (app) layout.
export const instant = false

export const metadata: Metadata = { title: '模板与提示词' }

// ?edit=<id> opens that template's editor, e.g. right after 「发布为模板」 created a draft (T101).
const editParam = (value: string | string[] | undefined) => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : undefined

export default async function AdminTemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin()
  const db = createAdminSupabase()
  // Start the shared trial data with the catalogue; the list renders without waiting for R2.
  const opening = Promise.resolve().then(() => preparePanelSummary({ db, store: r2Store() }))
  const summary = opening.then(data => data.summary).catch(() => null)
  const previews = opening.then(data => data.previews()).catch(() => null)
  const catalogue = loadCatalogue(db)
  const edit = editParam((await searchParams).edit)
  return <>
    <Suspense fallback={null}><PhotoPreloads previews={previews} /></Suspense>
    <Suspense fallback={null}>
      <TestPanelSummaryProvider initial={summary} previews={previews}><Catalogue data={catalogue} edit={edit} /></TestPanelSummaryProvider>
    </Suspense>
  </>
}
