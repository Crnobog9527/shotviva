import 'server-only'

import { notifyOwner } from '../alerts'
import type { GenerationProvider } from './provider'
import type { JobSource } from './job-schema'

export function routeFallbackReason(provider: GenerationProvider, binding: string | null, source: JobSource) {
  if (!binding || provider.id.startsWith(binding + '/')) return undefined
  return source === 'graylum' ? 'partner_channel' : provider.fallbackReason
}

// Covers refusals during reference preparation and credit reservation. The existing
// notifier claims a per-template/reason R2 marker across server instances.
export async function withFallbackNotice<T>(
  templateId: string, work: (selected: (reason: string | undefined) => void) => Promise<T>,
) {
  let reason: string | undefined
  let rejected = true
  try {
    const result = await work(value => { reason = value })
    rejected = false
    return result
  } finally {
    if (reason) notifyOwner({ kind: 'template_fallback', templateId, reason, rejected })
  }
}
