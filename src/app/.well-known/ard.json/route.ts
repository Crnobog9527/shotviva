import { absoluteUrl, indexingOpenNow, noindexForHost } from '@/core/seo'
import { site } from '@/site/site.config'

// Public discovery metadata. Advertise the documentation only where /llms.txt is published.
// Answered per request with no Cache-Control, like /llms.txt: the body depends on the host and the
// live indexing switch, and the proxy may attach refreshed session cookies, so no shared cache
// may keep it.
export function GET(request: Request) {
  const { domain, name } = site.brand
  const published = !noindexForHost(indexingOpenNow(), request.headers.get('host'), domain)
  return Response.json({
    entries: published ? [{
      identifier: `urn:air:${domain}:documentation`,
      displayName: `${name} public documentation`,
      type: 'text/plain',
      url: absoluteUrl(site, '/llms.txt'),
      description: 'A summary and links to public Shotviva pages about its AI image tools.',
      representativeQueries: [
        'Where can I find an overview of Shotviva?',
        'Which Shotviva pages explain its AI image tools?',
      ],
    }] : [],
  }, { headers: { 'Content-Type': 'application/ard+json' } })
}
