import type { AdminProvider, ConnectionResult, ProviderAdapterId, ProviderSettingReason } from '@/core/providers'

import type { Resolution } from '@/core/templates/output-options'

import type { SaveProviderInput } from './schema'

export type ProviderActionResult<T = void> = { ok: true; value: T } | { ok: false; reason: ProviderSettingReason }

// Server actions the editor calls; each re-checks the admin role itself.
export type ProviderAdminActions = {
  lookupModel: (input: { baseUrl: string; model: string }) => Promise<ProviderActionResult<Resolution[] | null>>
  save: (input: SaveProviderInput) => Promise<ProviderActionResult<string>>
  activate: (input: { id: string }) => Promise<ProviderActionResult>
  test: (input: { id: string }) => Promise<ProviderActionResult<ConnectionResult>>
  remove: (input: { id: string }) => Promise<ProviderActionResult>
}

export type { AdminProvider, ConnectionResult, ProviderAdapterId, ProviderSettingReason, SaveProviderInput }
