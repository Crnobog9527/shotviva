import { connection } from 'next/server'

import { isLocale } from '@/core/i18n/locales'
import { cachedPublicCatalogue, VERSION_PATTERN } from '@/modules/image/create-data'

// Create's public catalogue (modules/image/catalogue/public-catalogue.ts), same origin so the
// app's open connection carries it and the CDN keeps it at the edge:
//   /api/catalogue/public/<locale>/<version>  the file, immutable; any other version is a 404
//   /api/catalogue/public/<locale>/latest     the file, revalidated every minute
//   /api/catalogue/public/<locale>/current    { version }, revalidated every minute
// Public by nature (AGENTS §6): what any visitor may see of a published template. The proxy
// matcher skips this path, so no session work and no cookies on a cached answer. Malformed input
// is a 404 before any read; a well-formed unknown version costs only the cached current file.
const SHORT = 'public, max-age=60, stale-while-revalidate=86400'
const IMMUTABLE = 'public, max-age=31536000, immutable'

function respond(body: string | null, status: number, cache: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'CDN-Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

const notFound = () => respond('{"error":"NOT_FOUND"}', 404, 'public, max-age=60')

export async function GET(_request: Request, { params }: RouteContext<'/api/catalogue/public/[locale]/[version]'>) {
  // Never prerendered: the answer follows the live catalogue cache.
  await connection()
  const { locale, version } = await params
  if (!isLocale(locale)) return notFound()
  const named = version === 'latest' || version === 'current'
  if (!named && !VERSION_PATTERN.test(version)) return notFound()
  const file = await cachedPublicCatalogue(locale)
  if (!file) return named ? respond('{"error":"UNAVAILABLE"}', 503, 'no-store') : notFound()
  if (version === 'current') return respond(JSON.stringify({ version: file.version }), 200, SHORT)
  if (version === 'latest') return respond(file.body, 200, SHORT)
  return version === file.version ? respond(file.body, 200, IMMUTABLE) : notFound()
}
