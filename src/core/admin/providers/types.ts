import type { AdminProvider, ConnectionResult, ProviderAdapterId, ProviderSettingReason } from '@/core/providers'

import type { CatalogPrice } from '@/core/jobs'
import type { ImageCapabilities } from '@/core/templates/image-capabilities'

import type { SaveProviderInput } from './schema'

export type ProviderActionResult<T = void> = { ok: true; value: T } | { ok: false; reason: ProviderSettingReason }

// Server actions the editor calls; each re-checks the admin role itself.
export type ProviderAdminActions = {
  lookupModel: (input: { baseUrl: string; model: string; retry?: boolean }) => Promise<ProviderActionResult<ImageCapabilities | null>>
  // The live catalogue price for a model being typed in (null: no catalogue for this line).
  lookupPrice: (input: { adapter: ProviderAdapterId; baseUrl: string; model: string; retry?: boolean }) => Promise<ProviderActionResult<CatalogPrice | null>>
  save: (input: SaveProviderInput) => Promise<ProviderActionResult<string>>
  activate: (input: { id: string }) => Promise<ProviderActionResult>
  refresh: (input: { id: string }) => Promise<ProviderActionResult>
  test: (input: { id: string }) => Promise<ProviderActionResult<ConnectionResult>>
  remove: (input: { id: string }) => Promise<ProviderActionResult>
}

export type { AdminProvider, ConnectionResult, ProviderAdapterId, ProviderSettingReason, SaveProviderInput }
