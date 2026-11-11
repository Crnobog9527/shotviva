import { notFound } from 'next/navigation'
import { AdminPage } from '@/core/admin'
import { CatalogTable, PRODUCTS_COPY } from '@/core/admin/products'
import { E } from '@/core/admin/products/editor-copy'
import { readPage, readEditor, readRelease } from '@/core/admin/products/editor-data'
import { DraftForm } from '@/core/admin/products/editor-form'
import { CatalogList, CatalogNotice, EditorView } from '@/core/admin/products/editor-view'
import { archivable } from '@/core/admin/products/workflow'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { readProductCatalog } from '@/core/billing/product-catalog'
import { paymentChannel } from '@/core/billing/waffo/config'
import { site } from '@/site/site.config'
import { catalogAction } from './actions'

export const instant = false
export const metadata = { title: PRODUCTS_COPY.title }
type Search = { sku?: string; after?: string; before?: string; beforeId?: string; release?: string; error?: string; done?: string }

async function Listing({ actor, after }: { actor: string; after?: string }) {
  const db = createAdminSupabase()
  const rows = await readPage(db,actor,after ?? '')
  if (rows) return <CatalogList rows={rows} />
  return <><p>{E.migration}</p><CatalogTable rows={await readProductCatalog(db,site.billing.pricingVersion)} /></>
}

async function Detail({ sku, actor, query }: { sku: string; actor: string; query: Search }) {
  if (sku === 'new') return <DraftForm action={catalogAction} />
  const db = createAdminSupabase()
  const item = await readEditor(db,actor,sku,query.before,query.beforeId)
  if (!item) notFound()
  const selected = await readRelease(db,actor,sku,query.release)
  const prices = selected ? await archivable(db,actor,selected.id) : []
  return <EditorView item={item} action={catalogAction} waffo={paymentChannel() === 'waffo'} publishedCurrent={!!selected && selected.revision === item.current?.revision} archiveId={selected?.id} prices={prices} />
}
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requireAdmin()
  const query = await searchParams
  return <AdminPage title={query.sku === 'new' ? E.create : query.sku || PRODUCTS_COPY.title}>
    <CatalogNotice error={query.error} done={query.done} />
    {query.sku ? <Detail sku={query.sku} actor={actor.id} query={query} /> : <Listing actor={actor.id} after={query.after} />}
  </AdminPage>
}
