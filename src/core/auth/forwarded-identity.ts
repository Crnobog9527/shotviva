import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { LOCALES } from '../i18n/locales'
import type { SessionUser } from './session-user'

// The proxy has just checked who sent a signed-in page request (identity.ts); it hands the
// answer to the page on the forwarded request so the page does not check again (one check per
// request, ARCHITECTURE §7「会话校验」). The header never reaches the browser: it rides the
// request Next forwards internally, and the proxy deletes any copy a client sends.
// Paths the proxy does not see, or forwards untouched, could still carry a client's copy, so the
// page trusts the header only when
//   - its HMAC is ours (key derived from SUPABASE_SERVICE_ROLE_KEY, server-only),
//   - it is less than a minute old, and
//   - it was made for this request's own access token (a hash of it is inside), so a copy taken
//     from a log is useless without the session cookie it was made for.
// Anything else and the page checks the session itself.
export const IDENTITY_HEADER = 'x-shotviva-identity'
const TTL_MS = 60_000
const PURPOSE = 'shotviva:forwarded-identity:v1'

const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  verified: z.boolean(),
  banned: z.boolean(),
  locale: z.enum(LOCALES).nullable(),
  onboarding: z.object({ wishlistSeen: z.boolean(), wishlistHintSeen: z.boolean() }),
})
const Envelope = z.object({ v: z.literal(1), exp: z.number(), tok: z.string(), user: SessionUserSchema })

const keyOf = (secret: string) => createHmac('sha256', secret).update(PURPOSE).digest()
const macOf = (body: string, secret: string) => createHmac('sha256', keyOf(secret)).update(body).digest()
const tokenHash = (accessToken: string) => createHash('sha256').update(accessToken).digest('base64url')

export function sealIdentity(user: SessionUser, accessToken: string, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ v: 1, exp: now + TTL_MS, tok: tokenHash(accessToken), user })).toString('base64url')
  return `${body}.${macOf(body, secret).toString('base64url')}`
}

function parse(body: string): z.infer<typeof Envelope> | null {
  try {
    const parsed = Envelope.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// null: not ours, too old, or made for another session. The caller then checks for itself.
export function openIdentity(value: string, accessToken: string, secret: string, now = Date.now()): SessionUser | null {
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [body, mac] = parts as [string, string]
  const given = Buffer.from(mac, 'base64url')
  const expected = macOf(body, secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const envelope = parse(body)
  if (!envelope || envelope.exp <= now || envelope.tok !== tokenHash(accessToken)) return null
  return envelope.user
}
