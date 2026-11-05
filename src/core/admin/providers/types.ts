import type { AdminProvider, ConnectionResult, ProviderAdapterId, ProviderSettingReason } from '@/core/providers'

import type { SaveProviderInput } from './schema'

export type ProviderActionResult<T = void> = { ok: true; value: T } | { ok: false; reason: ProviderSettingReason }

// Server actions the editor calls; each re-checks the admin role itself.
export type ProviderAdminActions = {
  save: (input: SaveProviderInput) => Promise<ProviderActionResult<string>>
  activate: (input: { id: string }) => Promise<ProviderActionResult>
  test: (input: { id: string }) => Promise<ProviderActionResult<ConnectionResult>>
}

export type { AdminProvider, ConnectionResult, ProviderAdapterId, ProviderSettingReason, SaveProviderInput }
