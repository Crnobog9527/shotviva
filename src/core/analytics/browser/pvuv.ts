// PVUV.ai's browser script (https://pvuv.ai/docs). Loaded like PostHog and Sentry: after the
// page's load event, on idle (sdk.ts afterLoad), never in the critical path, by a script tag
// created here, not rendered into the HTML. Only for a visitor whose cookies are allowed
// (consent/decision.ts cookiesAllowed, the rule PostHog follows): the script keeps a visitor id
// in first-party cookies and localStorage, which PostHog's memory mode would not.

import { pvuvProps, type PvuvProps } from '../pvuv/props'

export const PVUV_SCRIPT_SRC = 'https://www.pvuv.ai/f.js'
export const PVUV_API = 'https://in.pvuv.ai'

// Pages the script must not measure: /admin and the signed-in app (proxy-gates.ts SIGNED_IN,
// ARCHITECTURE §7), in English and under /zh; /join holds org invite links, whose path is a
// credential (core/invite-path.ts). Patterns are PVUV's own globs, comma-separated.
const PRIVATE_ROOTS = ['/admin', '/account', '/checkout', '/generate', '/photos', '/posters', '/wishlist', '/reset/update', '/connect', '/join']
export const PVUV_EXCLUDE = PRIVATE_ROOTS.flatMap((root) => [root, `${root}/*`, `/zh${root}`, `/zh${root}/*`]).join(',')

export const PVUV_SCRIPT_ID = 'pvuv-script'
const STORAGE_KEY = /^_pv/

type Pvuv = (command: string, ...args: unknown[]) => void
type PvuvWindow = Window & { pvuv?: Pvuv }

// Events and the sign-in id of the first seconds, before the script is in (kept in order).
const MAX_QUEUED = 50
let loaded = false
let pendingUserId: string | null = null
let pendingEvents: Array<[string, PvuvProps]> = []

export function pvuvAttributes(site: string): Record<string, string> {
  return {
    defer: '',
    src: PVUV_SCRIPT_SRC,
    'data-api': PVUV_API,
    'data-site': site,
    'data-exclude': PVUV_EXCLUDE,
    // The coarse mobile-sensor signals stay off: less collected, and the privacy policy says so.
    'data-sensors': 'off',
    id: PVUV_SCRIPT_ID,
  }
}

export const pvuvLoaded = (): boolean => loaded

// Idempotent. The script reads its own tag's data-* attributes, so they are set before it is added.
export function loadPvuv(site: string, doc: Document = document): void {
  if (loaded || !site) return
  loaded = true
  const script = doc.createElement('script')
  for (const [name, value] of Object.entries(pvuvAttributes(site))) script.setAttribute(name, value)
  script.addEventListener('load', flushPending, { once: true })
  doc.head.appendChild(script)
}

function pvuvOf(win: Window): Pvuv | undefined {
  return (win as PvuvWindow).pvuv
}

function flushPending(): void {
  const call = pvuvOf(window)
  if (!call) return
  if (pendingUserId !== null) call('identify', pendingUserId)
  pendingUserId = null
  const events = pendingEvents
  pendingEvents = []
  for (const [name, props] of events) call('event', name, props)
}

// The Supabase user id, an opaque id and never an email (same rule as PostHog's identify, §16.1).
// The caller has checked consent. Before the script is in it is kept and sent when it loads.
export function pvuvIdentify(userId: string): void {
  pendingUserId = userId
  flushPending()
}

// A dictionary event (already validated, events.ts) as a PVUV goal. The caller has checked
// consent. Sent at once when the script is in, else queued for when it loads.
export function pvuvEvent(name: string, props: Record<string, unknown>): void {
  const flat = pvuvProps(props)
  const call = pvuvOf(window)
  if (call) call('event', name, flat)
  else if (pendingEvents.length < MAX_QUEUED) pendingEvents.push([name, flat])
}

// What PVUV keeps in this browser: the _pv_* cookies (host and parent domains) and storage keys.
export function clearPvuvStorage(doc: Document, storages: Storage[]): void {
  const names = doc.cookie
    .split(/;\s*/)
    .map((pair) => pair.split('=')[0] ?? '')
    .filter((name) => STORAGE_KEY.test(name))
  const labels = doc.location.hostname.split('.')
  const domains = [null, ...labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'))]
  for (const name of names) {
    for (const domain of domains) doc.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`
  }
  for (const storage of storages) {
    for (const key of Object.keys(storage)) if (STORAGE_KEY.test(key)) storage.removeItem(key)
  }
}

// Tests only.
export function resetPvuvForTest(): void {
  loaded = false
  pendingUserId = null
  pendingEvents = []
}
