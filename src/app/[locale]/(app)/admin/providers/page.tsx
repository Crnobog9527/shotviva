import type { Metadata } from 'next'

import { AdminPage, IdentityDryRun, PROVIDERS_COPY, ProvidersEditor } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { identityJudgeStats } from '@/core/identity-guard'
import { listProviders } from '@/core/providers'

import { activateProviderAction, deleteProviderAction, identityDryRunAction, saveProviderAction, testProviderAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §3.3, §10). The proxy answers non-admins with a
// 404 first; requireAdmin() stays the authoritative check. The listing never carries key
// ciphertext or plaintext, only the last four characters.
export const instant = false

// The face-swap dry run (T81) asks the decision model up to 50 times, four at a time, each with a
// 5 s deadline and one retry.
export const maxDuration = 180

export const metadata: Metadata = { title: PROVIDERS_COPY.title }

export default async function AdminProvidersPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [providers, stats] = await Promise.all([listProviders(db), identityJudgeStats(db)])
  return (
    <AdminPage title={PROVIDERS_COPY.title}>
      <ProvidersEditor
        providers={providers}
        actions={{ save: saveProviderAction, activate: activateProviderAction, test: testProviderAction, remove: deleteProviderAction }}
      />
      <IdentityDryRun run={identityDryRunAction} stats={stats} />
    </AdminPage>
  )
}
