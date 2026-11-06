import type { Metadata } from 'next'

import { AdminPage, COSTS_COPY, COSTS_DAYS, CostsView, loadAdminKeyStatus, loadBilled, loadOurDailyCosts } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { clearCostSettingsAction, saveCostSettingsAction } from './actions'

// /admin/costs (ARCHITECTURE §10.0, T33): OpenAI's billed cost per UTC day next to our summed
// cost_usd. Request-time; the OpenAI read is cached an hour inside loadBilled. Only the Admin
// key's last four characters reach the page.
export const instant = false

export const metadata: Metadata = { title: COSTS_COPY.title }

// The first UTC day of the window, so the cache key changes once a day.
const startDay = (days: number) => new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)

export default async function AdminCostsPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [ours, keyStatus, billed] = await Promise.all([
    loadOurDailyCosts(db, COSTS_DAYS),
    loadAdminKeyStatus(db),
    loadBilled(startDay(COSTS_DAYS), COSTS_DAYS),
  ])
  return (
    <AdminPage title={COSTS_COPY.title}>
      <CostsView
        days={COSTS_DAYS}
        ours={ours}
        billed={billed}
        keyStatus={keyStatus}
        actions={{ save: saveCostSettingsAction, clear: clearCostSettingsAction }}
      />
    </AdminPage>
  )
}
