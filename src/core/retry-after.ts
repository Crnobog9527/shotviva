// How long a browser waits before resending a request that was turned away with 429: the
// application's RATE_LIMITED, or the Vercel firewall's own 429 in front of it (which carries no
// code of ours). A throttled request is never a failure (queue-fairness plan §5): the caller
// waits this long and tries again. Client-safe.

// What the server sends on RATE_LIMITED (core/api-response).
export const RATE_LIMITED_RETRY_SECONDS = 15

// Without a usable Retry-After: 15–30 s, spread so a whole office that was turned away at the
// same moment does not come back in the same second.
const DEFAULT_MIN_MS = 15_000
const DEFAULT_SPREAD_MS = 15_000
// With one: that long plus up to 5 s, never under 1 s or over 2 minutes.
const HEADER_SPREAD_MS = 5_000
const MIN_MS = 1_000
const MAX_MS = 120_000

function headerMs(value: string | null, now: number): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = Date.parse(trimmed)
  return Number.isFinite(at) ? at - now : null
}

export function retryDelayMs(retryAfter: string | null, random: () => number = Math.random, now = Date.now()): number {
  const given = headerMs(retryAfter, now)
  if (given === null || given <= 0) return DEFAULT_MIN_MS + Math.floor(random() * DEFAULT_SPREAD_MS)
  return Math.min(MAX_MS, Math.max(MIN_MS, given) + Math.floor(random() * HEADER_SPREAD_MS))
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('cancelled', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('cancelled', 'AbortError'))
    }, { once: true })
  })
