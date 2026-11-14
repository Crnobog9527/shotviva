import { createHmac, timingSafeEqual } from 'node:crypto'

// Standard Webhooks (https://www.standardwebhooks.com), which Supabase Auth hooks use: the
// secret is shown as `v1,whsec_<base64>`; the signature is HMAC-SHA256 over
// `${webhook-id}.${webhook-timestamp}.${raw body}`, sent in `webhook-signature` as one or more
// space-separated `v1,<base64>` entries. Written out here rather than adding a dependency.

// Five minutes either way, as the reference libraries allow.
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export type SignatureFailure = 'missing_headers' | 'bad_secret' | 'stale' | 'mismatch'

function secretBytes(secret: string): Buffer | null {
  const base64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
  const bytes = Buffer.from(base64, 'base64')
  return bytes.length >= 16 ? bytes : null
}

export function signPayload(secret: Buffer, id: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64')
}

function sameSignature(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(candidate)
  return a.length === b.length && timingSafeEqual(a, b)
}

// null when the request is genuine, otherwise why not. `now` is in milliseconds.
export function verifyWebhookSignature(
  secret: string,
  headers: Pick<Headers, 'get'>,
  body: string,
  now: number = Date.now(),
): SignatureFailure | null {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatures = headers.get('webhook-signature')
  if (!id || !timestamp || !signatures) return 'missing_headers'
  const key = secretBytes(secret)
  if (!key) return 'bad_secret'
  const sentAt = Number(timestamp)
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - sentAt) > SIGNATURE_TOLERANCE_SECONDS) return 'stale'
  const expected = signPayload(key, id, timestamp, body)
  const match = signatures
    .split(' ')
    .map((entry) => entry.split(','))
    .some(([version, value]) => version === 'v1' && typeof value === 'string' && sameSignature(expected, value))
  return match ? null : 'mismatch'
}
