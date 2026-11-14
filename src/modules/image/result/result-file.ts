import { prepareResult, type PreparedResult } from './prepare-result'

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

// Two entries: the result as shown, and a free cut-out's 透明底 file once that is chosen.
const CACHE_SIZE = 2
const cache = new Map<string, Promise<PreparedResult | null>>()

// One fetch and one decode per result file, shared by the photo (transparency) and Share
// (the file). Clean outputs redirect to a signed R2 URL, so this read needs R2's CORS to
// allow GET from the site. no-store: a cached copy of the <img> request carries no CORS
// header and would fail this read. A failed load is forgotten so a revisit tries again.
export function loadResult(url: string, fetcher: Fetcher = fetch): Promise<PreparedResult | null> {
  const known = cache.get(url)
  if (known) return known
  const result = fetcher(url, { cache: 'no-store' })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => (blob ? prepareResult(blob) : null))
    .catch(() => null)
    .then((prepared) => {
      if (!prepared && cache.get(url) === result) cache.delete(url)
      return prepared
    })
  cache.set(url, result)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  return result
}
