import { handleLink } from '@/core/partner'

import { withPartnerDeps } from '../deps'

// Partner route: partner key instead of a user session (AGENTS §6 exception, ARCHITECTURE
// §14.3). Exchanges the one-time connect code for the account id; the code dies on use.
export async function POST(request: Request) {
  return withPartnerDeps('partner-link', (deps) => handleLink(request, deps))
}
