import 'server-only'

import { serverEnv } from '../env'
import { NOINDEX_HEADER, indexingOpen } from './indexing-env'

// The live state of the pre-launch switch (ARCHITECTURE §12.0) for this deployment. An invalid
// SITE_INDEXING throws here, so the build (static pages, robots) fails instead of shipping.
export function indexingOpenNow(): boolean {
  return indexingOpen(serverEnv())
}

// sitemap.xml, sitemap-pages.xml, sitemap-zh.xml and llms.txt while closed: a plain 404.
export function closedSeoFileResponse(): Response | null {
  if (indexingOpenNow()) return null
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', [NOINDEX_HEADER.key]: NOINDEX_HEADER.value },
  })
}
