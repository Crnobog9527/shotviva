// Who has closed which banner, kept in this browser only (ARCHITECTURE §10「关闭规则」). Signed-in
// and signed-out visitors behave the same; nothing is sent to the server, so every marketing page
// stays one static HTML for everyone.
//
// The store is one localStorage entry: { "<id>.<version>": expiresAtMs | 0 }. 0 means "until the
// announcement changes"; a new version has a new key, so it shows again. The version is a hash of
// what this visitor saw (their language's text, the link, the tone), so an edit to it shows the
// banner again while a change to the schedule or the close rule does not.

export const CLOSED_STORAGE_KEY = 'sv-ann-closed'
// The banner element. Here, not in the 'use client' view: a server component that imports a
// value from a client module gets a client reference, not the string, and the early script then
// looked up getElementById(undefined) and never hid anything (the 2026-11-12 flash).
export const BANNER_ELEMENT_ID = 'sv-announcement'
export const BANNER_KEY_ATTRIBUTE = 'data-ann-key'

const DAY = 86_400_000
// Older keys pile up with every edit; the newest few are all that can still match.
const MAX_ENTRIES = 20
// Keys go into a CSS selector in the early script, so anything else is ignored there and here.
export const KEY_PATTERN = /^[\w.-]{1,80}$/

type Store = Record<string, number>

export function parseClosed(raw: string | null): Store {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const store: Store = {}
    for (const [key, expires] of Object.entries(value)) {
      if (KEY_PATTERN.test(key) && typeof expires === 'number' && expires >= 0) store[key] = expires
    }
    return store
  } catch {
    return {}
  }
}

// Still closed at `now`: closed until it changes (0), or the reshow time has not come yet.
export function isClosed(store: Store, key: string, now: number): boolean {
  const expires = store[key]
  return expires !== undefined && (expires === 0 || expires > now)
}

// The store after closing `key`: expired entries dropped, newest MAX_ENTRIES kept.
export function recordClose(raw: string | null, key: string, reshowAfterDays: number | null, now: number): string {
  const live = Object.entries(parseClosed(raw)).filter(([other, expires]) => other !== key && (expires === 0 || expires > now))
  live.push([key, reshowAfterDays === null ? 0 : now + reshowAfterDays * DAY])
  return JSON.stringify(Object.fromEntries(live.slice(-MAX_ENTRIES)))
}

// FNV-1a, 32 bit, base 36: short, stable across runtimes, enough to tell two versions apart.
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export type VersionFields = { message: string; link: { url: string; label: string | null } | null; tone: string }

export function versionKey(id: string, fields: VersionFields): string {
  const text = [fields.message, fields.link?.url ?? '', fields.link?.label ?? '', fields.tone].join('\u0000')
  return `${id}.${hash(text)}`
}

// Runs in the static HTML right before the banner (outside its Suspense boundary, so it always
// comes first, whether the banner is in the shell or streams in later). It adds one <style> that
// hides every banner version this browser closed, so a closed banner never paints, not even for
// a frame before hydration. Constant text: nothing from the server is interpolated.
export const HIDE_CLOSED_SCRIPT =
  'try{var m=JSON.parse(localStorage.getItem(' +
  JSON.stringify(CLOSED_STORAGE_KEY) +
  ')||"{}"),n=Date.now(),c="",k;for(k in m)if(' +
  KEY_PATTERN.toString() +
  '.test(k)&&typeof m[k]=="number"&&(m[k]===0||m[k]>n))c+=".sv-ann[' +
  BANNER_KEY_ATTRIBUTE +
  '=\\""+k+"\\"]{display:none!important}";if(c){var s=document.createElement("style");s.textContent=c;document.head.appendChild(s)}}catch(_){}'

// Runs right after the banner: hides one whose end time passed after the cached HTML was made.
export const HIDE_ENDED_SCRIPT =
  'try{var e=document.getElementById(' +
  JSON.stringify(BANNER_ELEMENT_ID) +
  '),t=e&&e.getAttribute("data-ends-at");if(t&&Date.parse(t)<=Date.now())e.hidden=true}catch(_){}'
