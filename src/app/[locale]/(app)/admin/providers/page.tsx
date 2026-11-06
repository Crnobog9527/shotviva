import type { Metadata } from 'next'

import { PROVIDERS_COPY, ProvidersEditor } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { listProviders } from '@/core/providers'

import { activateProviderAction, deleteProviderAction, saveProviderAction, testProviderAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §3.3, §10). The proxy answers non-admins with a
// 404 first; requireAdmin() stays the authoritative check. The listing never carries key
// ciphertext or plaintext, only the last four characters.
export const instant = false

export const metadata: Metadata = { title: PROVIDERS_COPY.title }

export default async function AdminProvidersPage() {
  await requireAdmin()
  const providers = await listProviders(createAdminSupabase())
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-6">
      <h1 className="text-xl font-semibold">{PROVIDERS_COPY.title}</h1>
      <ProvidersEditor
        providers={providers}
        actions={{ save: saveProviderAction, activate: activateProviderAction, test: testProviderAction, remove: deleteProviderAction }}
      />
    </div>
  )
}
