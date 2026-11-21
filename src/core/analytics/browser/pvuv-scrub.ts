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
