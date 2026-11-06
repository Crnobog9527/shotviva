import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY as COPY } from './copy'

// The row's Delete button (ARCHITECTURE §3.3): the provider in use cannot be deleted, so its
// button is disabled with a hint; admin_delete_provider refuses it again on the server.
export function deleteControl(provider: AdminProvider, pending: boolean): { disabled: boolean; hint: string | null } {
  if (provider.isActive) return { disabled: true, hint: COPY.deleteActiveHint }
  return { disabled: pending, hint: null }
}
