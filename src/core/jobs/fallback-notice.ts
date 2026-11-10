import 'server-only'

import { notifyOwner } from '../alerts'
import { AppError } from '../errors'
import type { GenerationProvider } from './provider'
import type { JobSource } from './job-schema'

export function routeFallbackReason(provider: GenerationProvider, binding: string | null, source: JobSource) {
  if (!binding || provider.id.startsWith(binding + '/')) return undefined
  return source === 'graylum' ? 'partner_channel' : provider.fallbackReason
}

// The alert describes the price guard. Other failures still propagate to the caller.
export async function withFallbackNotice<T>(
  templateId: string, work: (selected: (reason: string | undefined) => void) => Promise<T>,
) {
  let reason: string | undefined
  let rejected = false
  try {
    return await work(value => { reason = value })
  } catch (error) {
    rejected = error instanceof AppError && error.code === 'TEMPLATE_UNAVAILABLE'
    throw error
  } finally {
    if (reason && (reason !== 'partner_channel' || rejected)) {
      notifyOwner({ kind: 'template_fallback', templateId, reason, rejected })
    }
  }
}
