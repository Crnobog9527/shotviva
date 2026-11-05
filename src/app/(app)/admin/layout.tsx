import { AdminShell, adminNavItems } from '@/core/admin'
import { requireAdmin } from '@/core/auth'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// One admin gate for every /admin/* route (T23). The proxy already answers non-admins with a
// 404 before rendering. A layout does not stop its pages from rendering and is not re-run on
// client navigation (Next "Layouts and auth checks"), so pages and server actions still call
// requireAdmin() too; it is cached per request, so that costs no extra round trip.
export const instant = false

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await requireAdmin()
  return (
    <AdminShell items={adminNavItems({ wishlist: isWishlistEnabled(site) })} email={admin.email}>
      {children}
    </AdminShell>
  )
}
