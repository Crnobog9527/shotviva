import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSmsSender, type SmsMessage, type SmsSender } from '../../sms'
import { phoneKey } from './phone-key'
import { parseMainlandPhone } from './phone-number'
import { handleSmsHook, type SmsHookDeps } from './sms-hook'
import type { SmsLimitStatus } from './sms-limits'
import { signPayload } from './webhook-signature'

// The Send SMS hook (T63): signature first, +86 only, our limits before any provider, and the
// code never in a log line. Made-up numbers, a throwaway secret.
const RAW = Buffer.from('shotviva-test-secret-0123456789abcdef')
const SECRET = `v1,whsec_${RAW.toString('base64')}`
const NOW = 1_762_500_000_000
const CODE = '402913'

function hookRequest(phone: string | null, { secret = RAW, otp = CODE } = {}) {
  const body = JSON.stringify({ user: { id: 'user-1', phone, email: '' }, sms: { otp } })
  const timestamp = String(NOW / 1000)
  return new Request('http://localhost/api/auth/sms-hook', {
    method: 'POST',
    body,
    headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signPayload(secret, 'msg_1', timestamp, body)}` },
  })
}

let outbox: SmsMessage[]
let authorize: ReturnType<typeof vi.fn<(key: string) => Promise<SmsLimitStatus>>>
let logs: string[]

const deps = (over: Partial<SmsHookDeps> = {}): SmsHookDeps => ({
  secret: SECRET,
  sender: { sender: fakeSmsSender(outbox) },
  authorize,
  now: () => NOW,
  ...over,
})

beforeEach(() => {
  outbox = []
  authorize = vi.fn(async () => 'ok' as const)
  logs = []
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((line: unknown) => void logs.push(String(line)))
  }
})
afterEach(() => vi.restoreAllMocks())

describe('handleSmsHook', () => {
  it('hands a signed +86 request to the adapter after the limits pass, keyed by the number hash', async () => {
    const response = await handleSmsHook(hookRequest('8614000000001'), deps())
    expect(response.status).toBe(200)
    expect(authorize).toHaveBeenCalledWith(phoneKey(parseMainlandPhone('14000000001')!))
    expect(outbox).toEqual([{ to: { e164: '+8614000000001', national: '14000000001' }, code: CODE, validMinutes: 5 }])
  })

  it('refuses a bad signature before reading anything', async () => {
    const response = await handleSmsHook(hookRequest('8614000000001', { secret: Buffer.from('not-the-hook-secret-at-all!!') }), deps())
    expect(response.status).toBe(401)
    expect(authorize).not.toHaveBeenCalled()
    expect(outbox).toEqual([])
  })

  it.each(['14155550123', '85291234567', '', null])('refuses a non-+86 number (%j) without counting or sending', async (phone) => {
    const response = await handleSmsHook(hookRequest(phone), deps())
    expect(response.status).toBe(400)
    expect(authorize).not.toHaveBeenCalled()
    expect(outbox).toEqual([])
  })

  it.each(['phone_cooldown', 'phone_daily', 'ip_daily', 'no_request'] as const)('a %s limit is a 429 and no provider call', async (status) => {
    authorize.mockResolvedValueOnce(status)
    const response = await handleSmsHook(hookRequest('8614000000001'), deps())
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { http_code: 429 } })
    expect(outbox).toEqual([])
  })

  it('answers 503 without a secret or a provider, and never sends', async () => {
    expect((await handleSmsHook(hookRequest('8614000000001'), deps({ secret: undefined }))).status).toBe(503)
    expect((await handleSmsHook(hookRequest('8614000000001'), deps({ sender: { problem: 'SMS_PROVIDER is not set' } }))).status).toBe(503)
    expect(outbox).toEqual([])
  })

  it('passes a provider refusal on, and a database error is a 500', async () => {
    const refusing: SmsSender = { name: 'test', send: async () => ({ ok: false, reason: 'rejected', providerCode: 'isv.BUSINESS_LIMIT_CONTROL' }) }
    expect((await handleSmsHook(hookRequest('8614000000001'), deps({ sender: { sender: refusing } }))).status).toBe(429)
    const broken: SmsSender = { name: 'test', send: async () => ({ ok: false, reason: 'failed', providerCode: 'network' }) }
    expect((await handleSmsHook(hookRequest('8614000000001'), deps({ sender: { sender: broken } }))).status).toBe(502)
    authorize.mockRejectedValueOnce(new Error('db down'))
    expect((await handleSmsHook(hookRequest('8614000000001'), deps())).status).toBe(500)
  })

  it('never writes the code or the full number to a log line', async () => {
    authorize.mockResolvedValueOnce('phone_daily')
    await handleSmsHook(hookRequest('8614000000001'), deps())
    const broken: SmsSender = { name: 'test', send: async () => ({ ok: false, reason: 'failed' }) }
    await handleSmsHook(hookRequest('8614000000001'), deps({ sender: { sender: broken } }))
    authorize.mockRejectedValueOnce(new Error("boom for 14000000001"))
    await handleSmsHook(hookRequest('8614000000001'), deps())
    expect(logs.length).toBeGreaterThan(0)
    for (const line of logs) {
      expect(line).not.toContain(CODE)
      expect(line).not.toContain('14000000001')
    }
    expect(logs.join('\n')).toContain('140****0001')
  })
})
