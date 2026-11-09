import 'server-only'

import { assertPublicBaseUrl, fetchImageCapabilities, findProvider, listProviders, persistRefreshedCapabilities, ProviderSettingError, type AdminProvider } from '@/core/providers'
import { CapabilityWriteConflict } from '@/core/providers/repository'
import { nextCapabilitySync } from '@/core/providers/capability-expiry'
import { logger } from '@/core/logger'

import type { ProviderCommandDeps } from './commands'
import { providerIdSchema } from './schema'

async function refresh(deps: ProviderCommandDeps, row: AdminProvider) {
  const url = row.adapter === 'openrouter_images' ? await assertPublicBaseUrl(row.baseUrl, deps.resolveHost) : row.baseUrl
  const capabilities = await fetchImageCapabilities(row.adapter, url, row.model, deps.fetch ?? fetch)
  if (!capabilities) throw new ProviderSettingError('invalid_input', 'An image provider is required')
  await persistRefreshedCapabilities(deps.db, row, capabilities)
}

async function imageRow(deps: ProviderCommandDeps, input: unknown) {
  const parsed = providerIdSchema.safeParse(input)
  if (!parsed.success) throw new ProviderSettingError('invalid_input', 'Invalid provider id')
  const row = await findProvider(deps.db, parsed.data.id)
  if (!row) throw new ProviderSettingError('not_found', 'Provider not found')
  if (row.module !== 'image') throw new ProviderSettingError('invalid_input', 'An image provider is required')
  return row
}

export async function refreshProviderCapabilities(deps: ProviderCommandDeps, input: unknown) {
  await refresh(deps, await imageRow(deps, input))
}

function winnerNeedsSync(row: AdminProvider, now: AdminProvider) {
  const sameIdentity = row.model === now.model && row.baseUrl === now.baseUrl && row.adapter === now.adapter
  return now.updatedAt === row.updatedAt || (sameIdentity && nextCapabilitySync(now.adapter === 'openai_images', now.capabilities) <= Date.now())
}

export async function syncDueProvider(deps: ProviderCommandDeps, input: unknown, retry = false) {
  const row = await imageRow(deps, input)
  const failedQuote = row.capabilities?.catalogPricing?.status === 'unavailable'
  if (!(retry && failedQuote) && nextCapabilitySync(row.adapter === 'openai_images', row.capabilities) > Date.now()) return false
  try {
    await refresh(deps, row)
  } catch (error) {
    if (!(error instanceof CapabilityWriteConflict)) throw error
    const now = await imageRow(deps, input)
    // Another session may have refreshed the same model or changed its route. Reload its
    // current option and let the field schedule that model's sync; never overwrite the winner.
    if (winnerNeedsSync(row, now)) throw error
  }
  return true
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
