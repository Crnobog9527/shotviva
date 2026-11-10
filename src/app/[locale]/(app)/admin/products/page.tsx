import { AdminPage } from '@/core/admin'
import { CatalogTable, PRODUCTS_COPY } from '@/core/admin/products'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { readProductCatalog } from '@/core/billing/product-catalog'
import { site } from '@/site/site.config'

export const instant = false
export const metadata = { title: PRODUCTS_COPY.title }

export default async function AdminProductsPage() {
  await requireAdmin()
  const rows = await readProductCatalog(createAdminSupabase(), site.billing.pricingVersion)
  return <AdminPage title={PRODUCTS_COPY.title}><CatalogTable rows={rows} /></AdminPage>
}
