'use server'

import { refresh, updateTag } from 'next/cache'

import {
  activateProvider,
  runProviderAction,
  saveProvider,
  testProvider,
  type ProviderActionResult,
  type ProviderCommandDeps,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { PROVIDERS_CACHE_TAG, type ConnectionResult } from '@/core/providers'

// Server actions are public endpoints, so each one re-checks the admin role itself. None of
// them returns a key: save answers with the row id, test with the HTTP outcome only.

const deps = (): ProviderCommandDeps => ({ db: createAdminSupabase() })

// The next generation must see the change without a redeploy (ARCHITECTURE §3.3).
function providersChanged() {
  updateTag(PROVIDERS_CACHE_TAG)
  refresh()
}

export async function saveProviderAction(input: unknown): Promise<ProviderActionResult<string>> {
  const admin = await requireAdmin()
  return runProviderAction(async () => {
    const id = await saveProvider(deps(), admin.id, input)
    providersChanged()
    return id
  })
}

export async function activateProviderAction(input: unknown): Promise<ProviderActionResult> {
  const admin = await requireAdmin()
  return runProviderAction(async () => {
    await activateProvider(deps(), admin.id, input)
    providersChanged()
  })
}

export async function testProviderAction(input: unknown): Promise<ProviderActionResult<ConnectionResult>> {
  await requireAdmin()
  return runProviderAction(() => testProvider(deps(), input))
}
