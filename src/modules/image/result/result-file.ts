import { prepareResult, type PreparedResult } from './prepare-result'

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

let last: { url: string; result: Promise<PreparedResult | null> } | null = null

// One fetch and one decode per result page, shared by the photo (transparency) and Share
// (the file). Clean outputs redirect to a signed R2 URL, so this read needs R2's CORS to
// allow GET from the site. no-store: a cached copy of the <img> request carries no CORS
// header and would fail this read. A failed load is forgotten so a revisit tries again.
export function loadResult(url: string, fetcher: Fetcher = fetch): Promise<PreparedResult | null> {
  if (last?.url === url) return last.result
  const result = fetcher(url, { cache: 'no-store' })
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => (blob ? prepareResult(blob) : null))
    .catch(() => null)
    .then((prepared) => {
      if (!prepared && last?.url === url) last = null
      return prepared
    })
  last = { url, result }
  return result
}
