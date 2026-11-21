import 'server-only'

import { warmPagesSoon } from '@/core/cache-warm/warm-pages'
import { PUBLIC_WARM_PATHS } from '@/site/warm-pages'

// Call right after expiring a cache tag the public pages carry (core/cache-warm/warm-pages.ts):
// the server renders them again once the response is sent, so visitors keep getting a HIT.
export function warmPublicPagesSoon(): void {
  warmPagesSoon(PUBLIC_WARM_PATHS)
}
