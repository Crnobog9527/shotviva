import { connection } from 'next/server'

import { handleAccount } from '@/core/partner'

import { withPartnerDeps } from '../deps'

// Partner route: partner key + X-Shotviva-Account instead of a session (AGENTS §6 exception).
// Remaining credits, paid status and the top-up link.
export async function GET(request: Request) {
  // Never prerender: the answer depends on the caller's key (and account).
  await connection()
  return withPartnerDeps('partner-account', (deps) => handleAccount(request, deps))
}
