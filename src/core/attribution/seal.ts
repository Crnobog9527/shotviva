import { createHmac, timingSafeEqual } from 'node:crypto'

import { touchSchema, type FirstTouch } from './first-touch'

// sv_ft is `<base64url JSON>.<base64url HMAC>` (ARCHITECTURE §16.6). The browser can read and
// delete it but not forge one: the server only trusts a value whose HMAC is ours (key derived from
// a server-only secret, as for the forwarded identity) and whose content passes touchSchema.
const PURPOSE = 'shotviva:first-touch:v1'
// A truncated HMAC-SHA256 tag keeps the cookie short; 128 bits is plenty against forgery.
const TAG_BYTES = 16

const keyOf = (secret: string) => createHmac('sha256', secret).update(PURPOSE).digest()
const tagOf = (body: string, secret: string) => createHmac('sha256', keyOf(secret)).update(body).digest().subarray(0, TAG_BYTES)

export function sealTouch(touch: FirstTouch, secret: string): string {
  const body = Buffer.from(JSON.stringify(touch)).toString('base64url')
  return `${body}.${tagOf(body, secret).toString('base64url')}`
}

// null for anything we did not seal, or whose content no longer passes the schema.
export function openTouch(value: string | undefined | null, secret: string): FirstTouch | null {
  if (!value || value.length > 1200) return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [body, tag] = parts as [string, string]
  const given = Buffer.from(tag, 'base64url')
  const expected = tagOf(body, secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const parsed = touchSchema.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
