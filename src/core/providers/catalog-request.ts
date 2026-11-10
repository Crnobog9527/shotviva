import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { PROVIDERS_CACHE_TAG } from './cache-tag'

// A cron batch or two concurrent admin requests may share the public catalogue endpoint.
// Entries live only while the GET is running; failed lookups can always be retried.
const fetching = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>()

async function request(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store',
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Image model catalogue unavailable')
  }
  return response.json()
}

function inFlight(url: string, fetchImpl: typeof fetch) {
  let requests = fetching.get(fetchImpl)
  if (!requests) fetching.set(fetchImpl, requests = new Map())
  const pending = requests.get(url)
  if (pending) return pending
  const result = request(url, fetchImpl).finally(() => requests.delete(url))
  requests.set(url, result)
  return result
}

async function cached(url: string) {
  'use cache'
  cacheTag(PROVIDERS_CACHE_TAG)
  try {
    const data = await inFlight(url, fetch)
    cacheLife({ revalidate: 3599, expire: 3600 })
    return { ok: true as const, data }
  } catch {
    // Cache the outcome, not a thrown promise. Reopening the editor during an outage
    // should not make every admin page hit the same failing public endpoint.
    cacheLife({ revalidate: 59, expire: 60 })
    return { ok: false as const }
  }
}

// Only validated public base URLs reach this function. A supplied transport (also used
// for an explicit refresh) bypasses the short-lived cache.
export async function getCatalogJson(url: string, fetchImpl?: typeof fetch) {
  if (fetchImpl) return inFlight(url, fetchImpl)
  const result = await cached(url)
  if (!result.ok) throw new Error('Image model catalogue unavailable')
  return result.data
}
