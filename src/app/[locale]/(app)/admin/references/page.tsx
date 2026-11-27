import { redirect } from 'next/navigation'

import { requireAdmin } from '@/core/auth'

// 素材参考库 is retired (Owner 2026-11-27): reference pictures live on the Owner's computer and go
// straight to the template windows. Old links land on the template list. The tables, data and stored
// files stay untouched; the API routes stay until the code is removed (R2).
export const instant = false

export default async function AdminReferencesPage() {
  await requireAdmin()
  redirect('/admin/templates')
}
