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
  cacheLife({ revalidate: 3599, expire: 3600 })
  return inFlight(url, fetch)
}

// Only validated public base URLs reach this function. A supplied transport (also used
// for an explicit refresh) bypasses the short-lived cache.
export function getCatalogJson(url: string, fetchImpl?: typeof fetch) {
  return fetchImpl ? inFlight(url, fetchImpl) : cached(url)
}
