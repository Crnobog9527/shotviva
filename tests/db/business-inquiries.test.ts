import { randomBytes, randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { listAdminInquiries, loadAdminInquiry, newInquiryCount, updateInquiry } from '@/core/inquiries/admin'
import { submitInquiry, type InquiryContext } from '@/core/inquiries/submit'
import { EMPTY_INQUIRY, type InquiryValues } from '@/core/inquiries/validate'

import { anonClient, connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// T86 (ARCHITECTURE §10.c): business_inquiries (0800) and submit_business_inquiry (0801), through
// the same server code the pricing page's action runs. IP hashes and emails are random per test.

let db: Client
const service = serviceSupabase()
const hash = () => randomBytes(32).toString('hex')
const email = () => `buyer-${randomUUID()}@example.test`

const values = (over: Partial<InquiryValues> = {}): InquiryValues => ({
  ...EMPTY_INQUIRY,
  name: 'Lin Wei',
  email: email(),
  company: 'Acme Foods',
  volume: '500_2000',
  uses: ['ecommerce', 'social'],
  message: 'About 300 product photos a month, on white.',
  consent: true,
  ...over,
})

const ctx = (over: Partial<InquiryContext> = {}): InquiryContext => ({ locale: 'en', page: '/pricing', userId: null, ip: null, ipHash: hash(), ...over })
const notify = vi.fn()
const submit = (input: InquiryValues, context: InquiryContext) => submitInquiry({ db: service, captcha: null, notify }, { values: input }, context)

// Moves the rows of an IP hash or an email back in time instead of waiting.
const age = (column: 'ip_hash' | 'email', value: string, seconds: number) =>
  db.query(`update public.business_inquiries set created_at = created_at - make_interval(secs => $2) where ${column === 'email' ? 'lower(email)' : 'ip_hash'} = lower($1)`, [value, seconds])

beforeAll(async () => {
  db = await connectAdmin()
})
afterAll(async () => {
  await db.end()
})

describe('submit_business_inquiry', () => {
  it('stores every answer, trimmed, with the email lower-cased and no plain IP', async () => {
    const userId = await createUser(db)
    const ipHash = hash()
    const input = values({ email: '  Buyer@Example.TEST ', wechat: 'acme_lin', phone: '+86 138 0013 8000', platforms: ['taobao_tmall', 'amazon'], needs: ['api'], teamSize: '6_20', startTime: 'asap' })
    expect(await submit(input, ctx({ userId, ipHash, locale: 'zh', page: '/zh/pricing' }))).toEqual({ ok: true })
    const { rows } = await db.query('select * from public.business_inquiries where ip_hash = $1', [ipHash])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'buyer@example.test',
      user_id: userId,
      locale: 'zh',
      page: '/zh/pricing',
      uses: ['ecommerce', 'social'],
      platforms: ['taobao_tmall', 'amazon'],
      needs: ['api'],
      team_size: '6_20',
      job_title: null,
      status: 'new',
      admin_note: null,
    })
    expect(JSON.stringify(rows[0])).not.toMatch(/198\.18\./)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'business_inquiry', inquiryId: rows[0].id, company: 'Acme Foods' }))
  })

  it('allows 3 per IP in an hour, then refuses until the hour has passed', async () => {
    const ipHash = hash()
    for (let i = 0; i < 3; i++) expect(await submit(values(), ctx({ ipHash }))).toEqual({ ok: true })
    expect(await submit(values(), ctx({ ipHash }))).toEqual({ ok: false, error: 'RATE_LIMITED' })
    await age('ip_hash', ipHash, 61 * 60)
    expect(await submit(values(), ctx({ ipHash }))).toEqual({ ok: true })
  })

  it('allows 10 per IP in 24 hours', async () => {
    const ipHash = hash()
    for (let i = 0; i < 10; i++) {
      expect(await submit(values(), ctx({ ipHash }))).toEqual({ ok: true })
      await age('ip_hash', ipHash, 21 * 60)
    }
    expect(await submit(values(), ctx({ ipHash }))).toEqual({ ok: false, error: 'RATE_LIMITED' })
    await age('ip_hash', ipHash, 24 * 60 * 60)
    expect(await submit(values(), ctx({ ipHash }))).toEqual({ ok: true })
  })

  it('allows 3 per email in 24 hours, whatever the case or the IP', async () => {
    const address = email()
    for (const typed of [address, address.toUpperCase(), ` ${address}`]) expect(await submit(values({ email: typed }), ctx())).toEqual({ ok: true })
    expect(await submit(values({ email: address }), ctx())).toEqual({ ok: false, error: 'RATE_LIMITED' })
    await age('email', address, 24 * 60 * 60)
    expect(await submit(values({ email: address }), ctx())).toEqual({ ok: true })
  })

  it('refuses invalid answers before the database and bad rows in it', async () => {
    expect(await submit(values({ message: 'short' }), ctx())).toMatchObject({ ok: false, error: 'INVALID_INPUT' })
    const raw = await service.rpc('submit_business_inquiry', {
      p_inquiry: { locale: 'en', page: '/pricing', name: 'A', email: email(), company: 'B', monthly_volume: 'lots', uses: ['ads'], message: 'long enough text' },
      p_ip_hash: null,
    })
    expect(raw.error?.code).toBe('23514')
  })

  it('is closed to visitors and signed-in users: no table access, no function', async () => {
    expect((await anonClient().select('business_inquiries')).ok).toBe(false)
    const rpc = await anonClient().rpc('submit_business_inquiry', { p_inquiry: {}, p_ip_hash: null })
    expect(rpc.error).not.toBeNull()
    const { rows } = await db.query(`
      select has_table_privilege('authenticated', 'public.business_inquiries', 'select') as auth_select,
             has_table_privilege('anon', 'public.business_inquiries', 'insert') as anon_insert,
             has_function_privilege('authenticated', 'public.submit_business_inquiry(jsonb, text)', 'execute') as auth_exec`)
    expect(rows[0]).toEqual({ auth_select: false, anon_insert: false, auth_exec: false })
  })
})

describe('admin reads and writes', () => {
  it('lists newest first, filters by status, counts the new ones, and saves status and note', async () => {
    const ipHash = hash()
    await submit(values({ company: 'Older Co' }), ctx({ ipHash }))
    await submit(values({ company: 'Newer Co' }), ctx({ ipHash }))
    const { rows } = await db.query<{ id: string; company: string }>('select id, company from public.business_inquiries where ip_hash = $1 order by created_at', [ipHash])
    const [older, newer] = rows
    if (!older || !newer) throw new Error('inquiries missing')

    const all = await listAdminInquiries(service, { status: 'all' })
    expect(all.items.findIndex((row) => row.id === newer.id)).toBeLessThan(all.items.findIndex((row) => row.id === older.id))

    const before = await newInquiryCount(service)
    await updateInquiry(service, { id: older.id, status: 'contacted', note: '  Emailed a quote  ' })
    expect(await newInquiryCount(service)).toBe(before - 1)
    expect(await loadAdminInquiry(service, older.id)).toMatchObject({ status: 'contacted', admin_note: 'Emailed a quote', company: 'Older Co' })
    const contacted = await listAdminInquiries(service, { status: 'contacted' })
    expect(contacted.items.map((row) => row.id)).toContain(older.id)
    expect(contacted.items.every((row) => row.status === 'contacted')).toBe(true)

    await updateInquiry(service, { id: older.id, status: 'won', note: '' })
    expect(await loadAdminInquiry(service, older.id)).toMatchObject({ status: 'won', admin_note: null })
    await expect(updateInquiry(service, { id: randomUUID(), status: 'won', note: '' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(updateInquiry(service, { id: older.id, status: 'archived', note: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await loadAdminInquiry(service, 'not-a-uuid')).toBeNull()
  })
})
