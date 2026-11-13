// Template share links (Owner 2026-11-13): /t/<templateId>?s=<shareId>. The share id is a random
// 8-character tag made when someone presses 分享, so the opens, sign-ups and first photos that
// one share brought can be counted together. Opening a share page remembers it in the sv_share
// cookie (first-party, 30 days), which the sign-up event and the first photo from that template
// read; it carries two slugs, nothing about the person.

export const SHARE_COOKIE = 'sv_share'
export const SHARE_PARAM = 's'
export const SHARE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

const TEMPLATE_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/
const SHARE_ID = /^[a-z0-9]{8}$/

export type ShareMark = { templateId: string; shareId: string | null }

export const isShareId = (value: unknown): value is string => typeof value === 'string' && SHARE_ID.test(value)
export const isShareTemplateId = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && TEMPLATE_ID.test(value)

export function newShareId(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(random(8), (byte) => alphabet[byte % alphabet.length]).join('')
}

// The path of a template's share page, before the language prefix.
export function sharePath(templateId: string, shareId?: string | null): string {
  const base = `/t/${encodeURIComponent(templateId)}`
  return shareId ? `${base}?${SHARE_PARAM}=${shareId}` : base
}

export function encodeShareMark({ templateId, shareId }: ShareMark): string {
  return shareId ? `${templateId}.${shareId}` : templateId
}

export function parseShareMark(value: string | null | undefined): ShareMark | null {
  if (!value) return null
  const [templateId, shareId, extra] = value.split('.')
  if (extra !== undefined || !isShareTemplateId(templateId)) return null
  if (shareId === undefined) return { templateId, shareId: null }
  return isShareId(shareId) ? { templateId, shareId } : null
}

// The referring site's host for template_share_open, without www.; null for none, our own
// site, or anything that is not an http(s) address.
export function referrerHostOf(referrer: string, ownHost: string): string | null {
  try {
    const url = new URL(referrer)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return host && host !== ownHost.toLowerCase().replace(/^www\./, '') && /^[a-z0-9.-]{1,100}$/.test(host) ? host : null
  } catch {
    return null
  }
}
