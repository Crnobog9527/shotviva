import { connection } from 'next/server'

import { handleTemplates } from '@/core/partner'

import { withPartnerDeps } from '../deps'

// Partner route: partner key instead of a session (AGENTS §6 exception). Public fields of
// templates visible to partners, freeform included; prompts never leave the server.
export async function GET(request: Request) {
  // Never prerender: the answer depends on the caller's key (and account).
  await connection()
  return withPartnerDeps('partner-templates', (deps) => handleTemplates(request, deps))
}
