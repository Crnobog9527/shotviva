import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { captchaCheck, captchaConfig } from './captcha'
import { inquiryIpHash } from './ip-hash'
import { inquiryRow, submitInquiry, type InquiryContext, type SubmitDeps } from './submit'
import { EMPTY_INQUIRY, type InquiryValues } from './validate'

// T86 (ARCHITECTURE §10.c): the server step. The limits themselves are in SQL (0801) and tested
// against a real database in tests/db/business-inquiries.test.ts.

const ID = '0b1c2d3e-4f50-4a6b-8c7d-8e9f0a1b2c3d'
const GOOD: InquiryValues = {
  ...EMPTY_INQUIRY,
  name: ' Lin Wei ',
  email: 'Lin@Example.com',
  company: 'Acme Foods',
  volume: '500_2000',
  uses: ['ecommerce', 'social'],
  message: 'About 300 product photos a month.',
  wechat: '  ',
  consent: true,
}
const CTX: InquiryContext = { locale: 'zh', page: '/zh/pricing', userId: null, ip: '198.18.0.1', ipHash: 'a'.repeat(64) }

function setup(answer: { data?: unknown; error?: { code: string; message: string } | null } = { data: { status: 'ok', id: ID } }) {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }))
  const notify = vi.fn()
  const deps: SubmitDeps = { db: { rpc } as unknown as SupabaseClient, captcha: null, notify }
  return { deps, rpc, notify }
}

describe('submitInquiry', () => {
  it('stores a valid inquiry through submit_business_inquiry and tells the Owner, without contact details', async () => {
    const { deps, rpc, notify } = setup()
    expect(await submitInquiry(deps, { page: '/zh/pricing', values: GOOD, captchaToken: null }, CTX)).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('submit_business_inquiry', { p_inquiry: inquiryRow(GOOD, CTX), p_ip_hash: CTX.ipHash })
    expect(notify).toHaveBeenCalledWith({ kind: 'business_inquiry', inquiryId: ID, company: 'Acme Foods', volume: '500_2000', uses: ['ecommerce', 'social'] })
    expect(JSON.stringify(notify.mock.calls)).not.toMatch(/lin@|Lin Wei/i)
  })

  it('trims answers and stores empty optional ones as null', () => {
    const row = inquiryRow(GOOD, CTX)
    expect(row).toMatchObject({ name: 'Lin Wei', wechat: null, phone: null, team_size: null, start_time: null, locale: 'zh', page: '/zh/pricing' })
  })

  it('refuses a form with missing answers before any database call, naming the fields', async () => {
    const { deps, rpc } = setup()
    const outcome = await submitInquiry(deps, { values: { ...GOOD, email: 'nope', consent: false } }, CTX)
    expect(outcome).toEqual({ ok: false, error: 'INVALID_INPUT', fields: { email: 'email', consent: 'consent' } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a malformed post', async () => {
    const { deps, rpc } = setup()
    expect(await submitInquiry(deps, { values: { ...GOOD, status: 'won' } }, CTX)).toEqual({ ok: false, error: 'INVALID_INPUT' })
    expect(await submitInquiry(deps, 'hello', CTX)).toEqual({ ok: false, error: 'INVALID_INPUT' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['ip_hourly', 'ip_daily', 'email_daily'])('answers RATE_LIMITED when the database says %s, and sends no alert', async (status) => {
    const { deps, notify } = setup({ data: { status, id: null } })
    expect(await submitInquiry(deps, { values: GOOD }, CTX)).toEqual({ ok: false, error: 'RATE_LIMITED' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('maps a check violation to INVALID_INPUT and anything else to generic', async () => {
    expect(await submitInquiry(setup({ error: { code: '23514', message: 'check' } }).deps, { values: GOOD }, CTX)).toEqual({ ok: false, error: 'INVALID_INPUT' })
    expect(await submitInquiry(setup({ error: { code: '08006', message: 'down' } }).deps, { values: GOOD }, CTX)).toEqual({ ok: false, error: 'generic' })
  })

  it('checks hCaptcha when it is on, before storing', async () => {
    const { deps, rpc } = setup()
    const captcha = vi.fn(async (token: string | null) => token === 'good')
    expect(await submitInquiry({ ...deps, captcha }, { values: GOOD, captchaToken: 'bad' }, CTX)).toEqual({ ok: false, error: 'CAPTCHA_FAILED' })
    expect(rpc).not.toHaveBeenCalled()
    expect(await submitInquiry({ ...deps, captcha }, { values: GOOD, captchaToken: 'good' }, CTX)).toEqual({ ok: true })
    expect(captcha).toHaveBeenLastCalledWith('good', CTX.ip)
  })
})

describe('hCaptcha check', () => {
  const config = { secret: 's3cret', siteKey: 'site' }
  const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)))

  it('is on only with both the site key and the secret', () => {
    expect(captchaConfig(undefined, 'site')).toBeNull()
    expect(captchaConfig('s3cret', '')).toBeNull()
    expect(captchaConfig('s3cret', 'site')).toEqual(config)
  })

  it('asks siteverify with the secret, token and IP, and follows its answer', async () => {
    const yes = reply({ success: true })
    expect(await captchaCheck(config, yes)('tok', '198.18.0.1')).toBe(true)
    const [url, init] = yes.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.hcaptcha.com/siteverify')
    expect(String(init.body)).toBe('secret=s3cret&response=tok&sitekey=site&remoteip=198.18.0.1')
    expect(await captchaCheck(config, reply({ success: false }))('tok', null)).toBe(false)
  })

  it('refuses a missing token without asking, and lets people through when hCaptcha is unreachable', async () => {
    const never = reply({ success: true })
    expect(await captchaCheck(config, never)(null, null)).toBe(false)
    expect(never).not.toHaveBeenCalled()
    const down = vi.fn(async () => Promise.reject(new Error('offline')))
    expect(await captchaCheck(config, down)('tok', null)).toBe(true)
  })
})

describe('inquiryIpHash', () => {
  it('is a stable keyed digest, never the address, and depends on the server secret', () => {
    const hash = inquiryIpHash('198.18.0.1', 'secret-a')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(inquiryIpHash('198.18.0.1', 'secret-a'))
    expect(hash).not.toBe(inquiryIpHash('198.18.0.1', 'secret-b'))
    expect(hash).not.toBe(inquiryIpHash('198.18.0.2', 'secret-a'))
    expect(inquiryIpHash(null, 'secret-a')).toBeNull()
  })
})
