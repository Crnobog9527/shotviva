import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadCohort, loadTemplateStats, type Cohort, type TemplateStat } from '@/core/admin/insights/reads'

import { promoter } from './affiliate-fixtures'
import { anonClient, connectAdmin, createPricedTemplate, createUser } from './helpers'

// admin_funnel_cohort (1510) and admin_template_stats (1511), ARCHITECTURE §16.2c. The period is
// May 2021 (Beijing), so rows other files write today cannot fall inside it. Written and read in
// one transaction that is rolled back, so the file leaves nothing behind.

const PERIOD = { from: '2021-05-01', to: '2021-05-07', start: '2021-04-30T16:00:00.000Z', end: '2021-05-07T16:00:00.000Z', days: 7 }
const at = (iso: string) => new Date(iso)

let db: Client
let cohort: Cohort
let tpl: TemplateStat
let otherTpl: TemplateStat
const ids: Record<string, string> = {}

async function user(name: string, signedAt: string, opts: { role?: 'admin'; locale?: string; referred?: string } = {}) {
  const id = await createUser(db)
  await db.query('update public.profiles set created_at = $2, role = $3 where id = $1', [id, at(signedAt), opts.role ?? 'user'])
  if (opts.referred) {
    await db.query("update public.profiles set referred_by = $2, referred_at = $3, referred_source = 'signup' where id = $1", [id, opts.referred, at(signedAt)])
  }
  if (opts.locale) await db.query("update auth.users set raw_user_meta_data = jsonb_build_object('locale', $2::text) where id = $1", [id, opts.locale])
  ids[name] = id
  return id
}

type Job = { status?: 'succeeded' | 'failed'; at: string; template?: string; source?: 'web' | 'graylum'; batch?: string; inputs?: object; pool?: 'free' | 'paid'; cost?: number; error?: string; againOf?: string }

async function job(userId: string, j: Job): Promise<string> {
  const id = randomUUID()
  const ok = (j.status ?? 'succeeded') === 'succeeded'
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, error_code, created_at, finished_at, batch_id, cost_usd)
     values ($1, $2, 'image', $3, $4, 'test/model', $5, $6, 'public', 4, $7, $8, $9, $10, $10, $11, $12)`,
    [id, userId, j.template ?? 'freeform', JSON.stringify({ resolution: '1k', ...j.inputs, ...(j.againOf ? { again_of: j.againOf } : {}) }), j.source ?? 'web', ok ? 'succeeded' : 'failed',
      j.pool ?? 'free', ok ? 'outputs/x.png' : null, ok ? null : (j.error ?? 'PROVIDER_FAILED'), at(j.at), j.batch ?? null, j.cost ?? null],
  )
  return id
}

async function pay(userId: string, createdAt: string) {
  const short = randomUUID().replaceAll('-', '').slice(0, 16)
  await db.query(
    `insert into public.payments (user_id, product_id, channel, stripe_session_id, stripe_charge_id, amount_total, amount_tax, amount_refunded, currency, method, status, created_at)
     values ($1, 'pack_s', 'stripe', $2, $3, 990, 0, 0, 'usd', 'card', 'paid', $4)`,
    [userId, `cs_test_${short}`, `ch_${short}`, at(createdAt)],
  )
}

beforeAll(async () => {
  db = await connectAdmin()
  await db.query('begin')
  try {
    await writeFixture()
  } finally {
    await db.query('rollback')
  }
}, 120_000)

afterAll(async () => {
  await db.end()
})

async function writeFixture() {
  const admin = await user('admin', '2021-05-02T01:00:00Z', { role: 'admin' })
  const promoterId = (await promoter(db)).id
  const imaged = await user('imaged', '2021-05-02T02:00:00Z', { locale: 'zh' })
  const graylum = await user('graylum', '2021-05-03T02:00:00Z')
  await user('referred', '2021-05-04T02:00:00Z', { referred: promoterId })
  await user('before', '2021-04-30T15:59:59Z')
  await user('after', '2021-05-07T16:00:00Z')
  await job(imaged, { status: 'failed', at: '2021-05-02T02:10:00Z' })
  await job(imaged, { at: '2021-05-02T03:00:00Z' })
  await pay(imaged, '2021-05-05T00:00:00Z')
  await pay(imaged, '2021-05-06T00:00:00Z')
  await db.query("insert into public.partner_links (user_id, partner, linked_at) values ($1, 'graylum', $2)", [graylum, at('2021-05-03T02:30:00Z')])
  await job(graylum, { at: '2021-05-03T03:00:00Z', source: 'graylum' })
  await writeTemplateFixture(admin, imaged, graylum)
  const read = async (fn: string, args: unknown[]) => (await db.query<{ s: unknown }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as s`, args)).rows[0]!.s
  cohort = await loadCohort({ rpc: async () => ({ data: await read('admin_funnel_cohort', [PERIOD.start, PERIOD.end]), error: null }) }, PERIOD)
  const stats = await loadTemplateStats({ rpc: async () => ({ data: await read('admin_template_stats', [PERIOD.start, PERIOD.end, 30]), error: null }) }, PERIOD)
  tpl = stats.templates.find((t) => t.template_id === ids.template)!
  otherTpl = stats.templates.find((t) => t.template_id === ids.other)!
}

async function writeTemplateFixture(admin: string, a: string, b: string) {
  const template = (ids.template = await createPricedTemplate(db))
  ids.other = await createPricedTemplate(db)
  const batch = randomUUID()
  // a: a first image, Make again from it (a redraw), then one 10 minutes later without Make again
  // (not a redraw: 1514 dropped the time-gap estimate).
  const first = await job(a, { template, at: '2021-05-02T04:00:00Z', pool: 'paid', cost: 1 })
  await job(a, { template, at: '2021-05-02T04:10:00Z', pool: 'paid', cost: 1, againOf: first })
  await job(a, { template, at: '2021-05-02T04:20:00Z', status: 'failed', error: 'PROVIDER_TIMEOUT' })
  // b: two cells of one batch, three poster pages (none of them redraws without a source), and a
  // free poster redraw that names its source.
  await job(b, { template, at: '2021-05-03T04:00:00Z', batch })
  await job(b, { template, at: '2021-05-03T04:00:01Z', batch })
  await job(b, { template, at: '2021-05-04T04:00:00Z', inputs: { poster: { set_id: 's1', part: 0 } } })
  await job(b, { template, at: '2021-05-04T04:01:00Z', inputs: { poster: { set_id: 's1', part: 1 } } })
  await job(b, { template, at: '2021-05-04T04:05:00Z', inputs: { poster: { set_id: 's1', part: 1 } } })
  await job(b, { template, at: '2021-05-05T04:00:00Z', inputs: { poster: { set_id: 's2', part: 0, redraw_of: randomUUID() } } })
  // An admin's job and one outside the period are left out.
  await job(admin, { template, at: '2021-05-03T04:00:00Z' })
  await job(a, { template, at: '2021-05-08T04:00:00Z' })
  await db.query('insert into public.template_favorites (user_id, template_id, created_at) values ($1, $3, $4), ($2, $3, $5)', [a, admin, template, at('2021-05-02T00:00:00Z'), at('2021-05-02T00:00:00Z')])
}

describe('admin_funnel_cohort', () => {
  it('lists the period\'s sign-ups, admins and the boundaries left out', () => {
    expect(cohort.people.map((p) => p.id)).toEqual([ids.imaged, ids.graylum, ids.referred])
    expect(cohort.admin_ids).toContain(ids.admin)
  })

  it('follows each person to their first successful image and first payment', () => {
    const imaged = cohort.people[0]!
    expect([imaged.first_image_at, imaged.first_paid_at].map((v) => v && new Date(v).toISOString())).toEqual(['2021-05-02T03:00:00.000Z', '2021-05-05T00:00:00.000Z'])
    expect(cohort.people[2]).toMatchObject({ first_image_at: null, first_paid_at: null })
  })

  it('carries the sign-up language, the Graylum link and the promoter binding', () => {
    expect(cohort.people.map((p) => [p.locale, p.graylum, p.referred])).toEqual([['zh', false, false], [null, true, false], [null, false, true]])
  })
})

describe('admin_template_stats', () => {
  it('counts finished jobs in the period, admins left out', () => {
    expect(tpl).toMatchObject({ uses: 9, users: 2, succeeded: 8, failed: 1, live: true })
  })

  it('counts redraws exactly: Make again (again_of) and named poster redraws only', () => {
    expect(tpl.redraws).toBe(2)
  })

  it('sums cost and credits by pool and lists failure codes', () => {
    expect(tpl).toMatchObject({ costed: 2, paid_cost_usd: 2, paid_credits: 8, credits: 32 })
    expect(tpl.errors).toEqual([{ code: 'PROVIDER_TIMEOUT', count: 1 }])
  })

  it('counts favourites without admins, and lists unused templates too', () => {
    expect([tpl.favourites, tpl.favourites_added]).toEqual([1, 1])
    expect(otherTpl).toMatchObject({ uses: 0, uses_14d: 0 })
  })
})

describe('guard rails', () => {
  it('refuses reversed, too long or future periods', async () => {
    const call = (fn: string, s: string, e: string) => db.query(`select public.${fn}($1, $2)`, [s, e])
    for (const fn of ['admin_funnel_cohort', 'admin_template_stats']) {
      await expect(call(fn, PERIOD.end, PERIOD.start)).rejects.toThrow(/INVALID_INPUT/)
      await expect(call(fn, '2021-01-01T00:00:00Z', '2021-05-01T00:00:00Z')).rejects.toThrow(/INVALID_INPUT/)
      await expect(call(fn, '2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z')).rejects.toThrow(/INVALID_INPUT/)
    }
  })

  it('is closed to browser keys', async () => {
    expect((await anonClient().rpc('admin_funnel_cohort', { p_start: PERIOD.start, p_end: PERIOD.end })).error).not.toBeNull()
    expect((await anonClient().rpc('admin_template_stats', { p_start: PERIOD.start, p_end: PERIOD.end })).error).not.toBeNull()
  })
})
