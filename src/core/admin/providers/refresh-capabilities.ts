import 'server-only'

import { assertPublicBaseUrl, fetchImageCapabilities, findProvider, listProviders, persistRefreshedCapabilities, ProviderSettingError, type AdminProvider } from '@/core/providers'
import { logger } from '@/core/logger'

import type { ProviderCommandDeps } from './commands'
import { providerIdSchema } from './schema'

async function refresh(deps: ProviderCommandDeps, row: AdminProvider) {
  const url = row.adapter === 'openrouter_images' ? await assertPublicBaseUrl(row.baseUrl, deps.resolveHost) : row.baseUrl
  const capabilities = await fetchImageCapabilities(row.adapter, url, row.model, deps.fetch)
  if (!capabilities) throw new ProviderSettingError('invalid_input', 'An image provider is required')
  await persistRefreshedCapabilities(deps.db, row, capabilities)
}

export async function refreshProviderCapabilities(deps: ProviderCommandDeps, input: unknown) {
  const parsed = providerIdSchema.safeParse(input)
  if (!parsed.success) throw new ProviderSettingError('invalid_input', 'Invalid provider id')
  const row = await findProvider(deps.db, parsed.data.id)
  if (!row) throw new ProviderSettingError('not_found', 'Provider not found')
  await refresh(deps, row)
}

export async function refreshAllCapabilities(deps: ProviderCommandDeps) {
  const rows = (await listProviders(deps.db)).filter((row) => row.module === 'image')
  const results = await Promise.allSettled(rows.map((row) => refresh(deps, row)))
  let failures = 0
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      failures++
      logger.warn('provider.capabilities.refresh_failed', { providerId: rows[index].id })
    }
  }
  return { updated: rows.length - failures, failures }
}
