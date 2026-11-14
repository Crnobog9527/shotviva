import { notFound } from 'next/navigation'
import { AffiliateAdminView, COPY, parseFilters, requireAffiliateAdmin } from '@/core/affiliate/admin'
import { createAdminSupabase } from '@/core/auth'
import { saveAffiliate } from './actions'

export const instant = false
export const metadata = { title: COPY.title }
export default async function AffiliatesPage({ searchParams }: PageProps<'/[locale]/admin/affiliates'>) {
  const admin = await requireAffiliateAdmin()
  const parsed = parseFilters(await searchParams)
  if (!parsed.success) notFound()
  return <AffiliateAdminView db={createAdminSupabase()} filters={parsed.data} action={saveAffiliate} actor={admin.id} />
}
