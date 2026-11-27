import { notFound } from 'next/navigation'
import { AdminPage } from '@/core/admin'
import { AffiliateAdminView, COPY, parseFilters } from '@/core/affiliate/admin'
import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { AffiliateSwitchCard } from '@/core/affiliate/switch-card'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { latestAffiliateTermsVersion } from '@/site/content/affiliate-terms'
import { saveAffiliate, saveAffiliateSwitchAction } from './actions'

export const instant = false
export const metadata = { title: COPY.title }

// The program's master switch sits on top (Owner 2026-11-27). While the program is off the page
// shows only the switch, so it can be turned back on; every other affiliate endpoint still 404s.
export default async function AffiliatesPage({ searchParams }: PageProps<'/[locale]/admin/affiliates'>) {
  const admin = await requireAdmin()
  const parsed = parseFilters(await searchParams)
  if (!parsed.success) notFound()
  const enabled = await isAffiliateEnabled()
  const master = <AffiliateSwitchCard enabled={enabled} save={saveAffiliateSwitchAction} />
  if (!enabled) return <AdminPage title={COPY.title}>{master}</AdminPage>
  return <AffiliateAdminView db={createAdminSupabase()} filters={parsed.data} action={saveAffiliate} actor={admin.id} latestTerms={latestAffiliateTermsVersion()} master={master} />
}
