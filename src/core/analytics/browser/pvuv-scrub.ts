import { redactInvitePath } from '../../invite-path'
import { splitLocale } from '../../i18n/paths'

// What PVUV's f.js is allowed to send (https://pvuv.ai/docs). The script reports the page's full
// address (hash, query, a path that may hold an id) and the referrer unchanged, and keeps the
// first visit's referrer in its _pv_ft cookie. PostHog went through scrubUrl/redactInvitePath
// (posthog-config.ts); PVUV has no pre-send hook, so the loader wraps the two calls the script
// uses to reach its API (sendBeacon and fetch to PVUV_API) and cleans the payload on its way out.
// The request still goes straight from the browser to PVUV, with the visitor's own address.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const CAMPAIGN = /^utm_[a-z_]+$/i

// An address as PVUV may keep it: origin and path, the campaign tags (utm_*) and nothing else
// (no hash, no other parameter: ?code=, ?session_id=, ?next= and the like). A page the script
// must not measure is cut to its first segment (/generate/<id> → /generate); an org invite
// token is redacted wherever it sits.
export function scrubPvuvUrl(value: string, privateRoots: readonly string[]): string {
  try {
    const url = new URL(value)
    const { path } = splitLocale(url.pathname)
    const prefix = path === '/' ? '' : url.pathname.slice(0, url.pathname.length - path.length)
    const root = privateRoots.find((r) => path === r || path.startsWith(`${r}/`))
    const pathname = root ? `${prefix}${root}` : redactInvitePath(url.pathname)
    const kept = root ? [] : [...url.searchParams].filter(([name]) => CAMPAIGN.test(name))
    const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : ''
    return `${url.origin}${pathname}${query}`
  } catch {
    return redactInvitePath(value).replace(EMAIL, '[email]')
  }
}

function scrubValue(value: unknown, roots: readonly string[], depth = 0): unknown {
  if (typeof value === 'string') return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? scrubPvuvUrl(value, roots) : redactInvitePath(value).replace(EMAIL, '[email]')
  if (depth > 4) return undefined
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, roots, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(v, roots, depth + 1)]))
  return value
}

type Beat = Record<string, unknown>

function scrubBeat(beat: unknown, roots: readonly string[]): unknown {
  if (!beat || typeof beat !== 'object' || Array.isArray(beat)) return beat
  const out: Beat = { ...(beat as Beat) }
  for (const key of ['u', 'r'] as const) {
    if (typeof out[key] === 'string') out[key] = scrubPvuvUrl(out[key], roots)
  }
  const ft = out.ft as Beat | undefined
  if (ft && typeof ft === 'object') out.ft = { ...ft, ...(typeof ft.r === 'string' && { r: scrubPvuvUrl(ft.r, roots) }) }
  if (out.p !== undefined) out.p = scrubValue(out.p, roots)
  return out
}

// The request body (one beat or an array of them), cleaned; null when it cannot be read, so
// nothing unchecked is ever sent.
export function scrubPvuvBody(body: string, roots: readonly string[]): string | null {
  try {
    const parsed: unknown = JSON.parse(body)
    return JSON.stringify(Array.isArray(parsed) ? parsed.map((b) => scrubBeat(b, roots)) : scrubBeat(parsed, roots))
  } catch {
    return null
  }
}

const FIRST_TOUCH = '_pv_ft'
const FIRST_TOUCH_MAX_AGE = 396 * 86_400

type CookieDoc = Pick<Document, 'cookie'> & { location: Pick<Location, 'hostname' | 'protocol'> }

// The cookie domain f.js uses: the shortest parent of the host that accepts a cookie (none on an
// IP or a single label).
function cookieDomain(doc: CookieDoc): string {
  const host = doc.location.hostname
  if (/^[\d.]+$/.test(host) || !host.includes('.')) return ''
  const labels = host.split('.')
  for (let i = labels.length - 2; i >= 0; i--) {
    const domain = labels.slice(i).join('.')
    doc.cookie = `_pv_t=1; Path=/; Domain=.${domain}; Max-Age=60; SameSite=Lax`
    if (/(?:^|;\s*)_pv_t=/.test(doc.cookie)) {
      doc.cookie = `_pv_t=; Path=/; Domain=.${domain}; Max-Age=0`
      return domain
    }
  }
  return ''
}

// f.js keeps the first visit's raw referrer in the _pv_ft cookie (396 days, the whole site's
// domain, sent with every request to it): a full invite or ?code= address after a full-page
// navigation. Rewritten with the referrer scrubbed, same name, path and domain. Only when it
// changes, so a clean cookie is not touched.
export function scrubFirstTouchCookie(doc: CookieDoc, roots: readonly string[]): void {
  try {
    const match = doc.cookie.match(new RegExp(`(?:^|;\\s*)${FIRST_TOUCH}=([^;]*)`))
    if (!match?.[1]) return
    const touch = JSON.parse(decodeURIComponent(match[1])) as Beat
    if (typeof touch.r !== 'string') return
    const clean = scrubPvuvUrl(touch.r, roots)
    if (clean === touch.r) return
    const domain = cookieDomain(doc)
    const secure = doc.location.protocol === 'https:' ? '; Secure' : ''
    doc.cookie = `${FIRST_TOUCH}=${encodeURIComponent(JSON.stringify({ ...touch, r: clean }))}; Path=/; Max-Age=${FIRST_TOUCH_MAX_AGE}; SameSite=Lax${domain ? `; Domain=.${domain}` : ''}${secure}`
  } catch {
    // An unreadable cookie is left to the script.
  }
}

type Scrubbable = {
  fetch?: typeof fetch
  navigator?: { sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean }
}

let installed = false

// Wraps the window's sendBeacon and fetch for requests to `api` only; everything else passes through.
export function installPvuvScrub(win: Scrubbable, api: string, roots: readonly string[]): void {
  if (installed) return
  installed = true
  const nav = win.navigator
  const beacon = nav?.sendBeacon?.bind(nav)
  if (nav && beacon) {
    nav.sendBeacon = (url, data) => {
      if (!String(url).startsWith(api)) return beacon(url, data)
      const clean = typeof data === 'string' ? scrubPvuvBody(data, roots) : null
      return clean === null ? true : beacon(url, clean)
    }
  }
  const send = win.fetch?.bind(win)
  if (win.fetch && send) {
    win.fetch = (input, init) => {
      if (typeof input !== 'string' || !input.startsWith(api)) return send(input, init)
      const clean = typeof init?.body === 'string' ? scrubPvuvBody(init.body, roots) : null
      return clean === null ? Promise.resolve(new Response(null, { status: 204 })) : send(input, { ...init, body: clean })
    }
  }
}

// Tests only.
export function resetPvuvScrubForTest(): void {
  installed = false
}
