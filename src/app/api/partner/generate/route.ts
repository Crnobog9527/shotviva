import { handleGenerate } from '@/core/partner'

import { withPartnerGenerateDeps } from '../deps'

// Partner route: partner key + X-Shotviva-Account instead of a session (AGENTS §6 exception).
// Synchronous like /api/generate: the provider gets 240s of these 300 so a timeout is refunded.
export const maxDuration = 300

export async function POST(request: Request) {
  return withPartnerGenerateDeps('partner-generate', (deps) => handleGenerate(request, deps))
}
