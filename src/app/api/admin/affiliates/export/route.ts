import { createAdminSupabase } from '@/core/auth'
import { exportCsv, parseFilters, requireAffiliateAdmin } from '@/core/affiliate/admin'

export async function GET(req: Request) {
  await requireAffiliateAdmin()
  const parsed = parseFilters(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success || !['payouts', 'commissions'].includes(parsed.data.tab)) return new Response(null, { status: 400 })
  return exportCsv(createAdminSupabase(), parsed.data)
}
