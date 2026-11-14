import { describe, expect, it } from 'vitest'

import { signPayload, verifyWebhookSignature } from './webhook-signature'

// Standard Webhooks, as Supabase signs the Send SMS hook (T63). A throwaway test secret.
const RAW = Buffer.from('shotviva-test-secret-0123456789abcdef')
const SECRET = `v1,whsec_${RAW.toString('base64')}`
const BODY = '{"user":{"id":"u1","phone":"8614000000001"},"sms":{"otp":"123456"}}'
const NOW = 1_762_500_000_000

function headersFor(body: string, { id = 'msg_1', at = NOW / 1000, secret = RAW } = {}) {
  const timestamp = String(Math.floor(at))
  return new Headers({ 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signPayload(secret, id, timestamp, body)}` })
}

describe('verifyWebhookSignature', () => {
  it('accepts a body signed with the hook secret, with or without the v1, prefix', () => {
    expect(verifyWebhookSignature(SECRET, headersFor(BODY), BODY, NOW)).toBeNull()
    expect(verifyWebhookSignature(SECRET.replace('v1,', ''), headersFor(BODY), BODY, NOW)).toBeNull()
  })

  it('accepts when any of several space-separated signatures matches (secret rotation)', () => {
    const headers = headersFor(BODY)
    headers.set('webhook-signature', `v1,bm90LXRoaXMtb25l ${headers.get('webhook-signature')}`)
    expect(verifyWebhookSignature(SECRET, headers, BODY, NOW)).toBeNull()
  })

  it('refuses a changed body, another secret, or a missing header', () => {
    expect(verifyWebhookSignature(SECRET, headersFor(BODY), BODY.replace('123456', '654321'), NOW)).toBe('mismatch')
    expect(verifyWebhookSignature(SECRET, headersFor(BODY, { secret: Buffer.from('another-secret-another-secret!!') }), BODY, NOW)).toBe('mismatch')
    const headers = headersFor(BODY)
    headers.delete('webhook-id')
    expect(verifyWebhookSignature(SECRET, headers, BODY, NOW)).toBe('missing_headers')
  })

  it('refuses a timestamp more than five minutes away (replay)', () => {
    expect(verifyWebhookSignature(SECRET, headersFor(BODY, { at: NOW / 1000 - 301 }), BODY, NOW)).toBe('stale')
    expect(verifyWebhookSignature(SECRET, headersFor(BODY, { at: NOW / 1000 + 301 }), BODY, NOW)).toBe('stale')
    expect(verifyWebhookSignature(SECRET, headersFor(BODY, { at: NOW / 1000 - 299 }), BODY, NOW)).toBeNull()
  })

  it('refuses a secret too short to be one', () => {
    expect(verifyWebhookSignature('v1,whsec_c2hvcnQ=', headersFor(BODY), BODY, NOW)).toBe('bad_secret')
  })
})
