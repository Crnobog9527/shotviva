import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { decideWorks, listReviewWorks, pendingReviewCount } from '@/core/admin/gallery-review'
import { screenWork, sweepModeration } from '@/core/moderation'

import { anonClient, connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// T108 (ARCHITECTURE §9 第 5、7、8 条, §9.1, migrations 1202–1207): the screen's verdict, a
// person's decision, reports, and the review page's reads, against the real functions.

let db: Client
let admin: string
let owner: string
let template: string
const service = serviceSupabase()
const store = { presignGet: async (key: string) => `https://signed.test/${key}` }

type JobOptions = { visibility?: 'public' | 'private'; source?: 'web' | 'graylum'; templateId?: string; pool?: 'free' | 'paid' }

async function work(options: JobOptions = {}) {
  const id = randomUUID()
  const pool = options.pool ?? 'free'
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, source, status, visibility, credits_cost, output_key, finished_at, credit_pool, inputs)
     values ($1, $2, 'image', $3, $4, 'succeeded', $5, 2, $6, now(), $7, $8)`,
    [id, owner, options.templateId ?? template, options.source ?? 'web', options.visibility ?? 'public', `outputs/${owner}/${id}.png`, pool,
      JSON.stringify({ copy: { dish: 'Grilled salmon' }, note: 'private note' })],
  )
  return id
}

const stateOf = async (id: string) =>
  (await db.query(
    `select moderation_status as status, moderation_reason as reason, moderation_categories as categories,
            auto_moderated_at is not null as screened, moderated_at is not null as decided, moderated_by as by
       from public.generation_jobs where id = $1`, [id])).rows[0]
const record = (id: string, flagged: boolean, categories: string[] = []) =>
  service.rpc('record_work_auto_moderation', { p_job_id: id, p_flagged: flagged, p_categories: categories })
const setAuto = (on: boolean) =>
  db.query(`insert into public.system_settings (key, value) values ('gallery_auto_approve', $1) on conflict (key) do update set value = excluded.value`, [JSON.stringify(on)])
const decide = (input: unknown, actor = admin) => decideWorks({ db: service, invalidate: () => undefined }, actor, input)
const report = (jobId: string, reporter: string, reason = 'spam', note: string | null = null) =>
  service.rpc('report_work', { p_job_id: jobId, p_reporter: reporter, p_reason: reason, p_note: note })

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  owner = await createUser(db)
  template = `t108-${randomUUID().slice(0, 8)}`
  await db.query(
    `insert into public.templates (id, name, category, fields, is_active, visible_in) values ($1, 'T108 dish', 'food', $2, false, array['web'])`,
    [template, JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })],
  )
})

beforeEach(async () => {
  await db.query(`delete from public.system_settings where key = 'gallery_auto_approve'`)
})

afterAll(async () => {
  await db.query(`delete from public.system_settings where key = 'gallery_auto_approve'`)
  await db.end()
})

describe('record_work_auto_moderation', () => {
  it('rejects a flagged work with the categories, and keeps an unflagged one pending while auto-approve is off', async () => {
    const flagged = await work()
    expect((await record(flagged, true, ['sexual'])).data).toBe('rejected')
    expect(await stateOf(flagged)).toMatchObject({ status: 'rejected', reason: 'auto', categories: ['sexual'], screened: true, decided: true, by: null })

    const clean = await work()
    expect((await record(clean, false)).data).toBe('pending')
    expect(await stateOf(clean)).toMatchObject({ status: 'pending', reason: null, screened: true, decided: false })
  })

  it('approves an unflagged work while auto-approve is on, never overwriting a person', async () => {
    await setAuto(true)
    const clean = await work()
    expect((await record(clean, false)).data).toBe('approved')
    const decided = await work()
    await decide({ jobIds: [decided], decision: 'rejected', reason: 'quality' })
    expect((await record(decided, false)).data).toBe('rejected')
    expect(await stateOf(decided)).toMatchObject({ status: 'rejected', reason: 'quality', by: admin })
  })

  it('writes nothing for a private or deleted work', async () => {
    const hidden = await work({ visibility: 'private', pool: 'paid' })
    const deleted = await work()
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [deleted])
    for (const id of [hidden, deleted]) {
      expect((await record(id, true, ['violence'])).data).toBeNull()
      expect(await stateOf(id)).toMatchObject({ status: 'pending', screened: false })
    }
  })
})

describe('admin_moderate_works', () => {
  it('decides a batch in one go, skipping deleted works, auditing each and resolving their reports', async () => {
    const [a, b, gone] = [await work(), await work(), await work()]
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [gone])
    expect(await decide({ jobIds: [a, b, gone], decision: 'approved', reason: null })).toBe(2)
    const reporter = await createUser(db)
    expect((await report(a, reporter)).data).toBe('reported')
    expect(await decide({ jobIds: [a], decision: 'rejected', reason: 'ip' })).toBe(1)
    expect(await stateOf(a)).toMatchObject({ status: 'rejected', reason: 'ip', by: admin })
    expect((await db.query('select resolved_at is not null as done from public.work_reports where job_id = $1', [a])).rows).toEqual([{ done: true }])
    const audits = (await db.query(`select reason from public.admin_audit_log where action = 'moderate_work' and target_id = $1 order by id`, [a])).rows
    expect(audits.map((row) => row.reason)).toEqual(['approved', 'rejected:ip'])
  })

  it('refuses a non-admin, a rejection without a reason and more than 50 works', async () => {
    const id = await work()
    await expect(decide({ jobIds: [id], decision: 'approved', reason: null }, owner)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(decide({ jobIds: [id], decision: 'rejected', reason: null })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const tooMany = Array.from({ length: 51 }, () => randomUUID())
    const { error } = await service.rpc('admin_moderate_works', { p_actor: admin, p_job_ids: tooMany, p_decision: 'approved', p_reason: null })
    expect(error?.message).toBe('INVALID_INPUT')
    expect(await stateOf(id)).toMatchObject({ status: 'pending' })
  })
})

describe('report_work', () => {
  it('takes reports on approved gallery works only, once per person, and 20 a day', async () => {
    const pending = await work()
    const reporter = await createUser(db)
    expect((await report(pending, reporter)).error?.message).toBe('NOT_FOUND')
    const shown = await work()
    await decide({ jobIds: [shown], decision: 'approved', reason: null })
    expect((await report(shown, reporter, 'privacy', ' my face ')).data).toBe('reported')
    expect((await report(shown, reporter)).data).toBe('duplicate')
    expect((await db.query('select reason, note from public.work_reports where job_id = $1', [shown])).rows).toEqual([{ reason: 'privacy', note: 'my face' }])

    const busy = await createUser(db)
    const many = await Promise.all(Array.from({ length: 21 }, () => work()))
    await decide({ jobIds: many, decision: 'approved', reason: null })
    const outcomes = []
    for (const id of many) outcomes.push((await report(id, busy)).data)
    expect(outcomes.filter((o) => o === 'reported')).toHaveLength(20)
    expect(outcomes.at(-1)).toBe('limited')
  })

  it('refuses a banned reporter, an unknown reason, a long note, and works outside the gallery', async () => {
    const shown = await work()
    const partner = await work({ source: 'graylum' })
    await decide({ jobIds: [shown, partner], decision: 'approved', reason: null })
    const banned = await createUser(db)
    await db.query('update public.profiles set banned_at = now() where id = $1', [banned])
    expect((await report(shown, banned)).error?.message).toBe('FORBIDDEN')
    const reporter = await createUser(db)
    expect((await report(shown, reporter, 'boring')).error?.message).toBe('INVALID_INPUT')
    expect((await report(shown, reporter, 'other', 'x'.repeat(501))).error?.message).toBe('INVALID_INPUT')
    expect((await report(partner, reporter)).error?.message).toBe('NOT_FOUND')
  })
})

describe('privileges', () => {
  it('no client role can call the functions or read work_reports', async () => {
    const { rows } = await db.query(
      `select has_function_privilege('authenticated', 'public.report_work(uuid, uuid, text, text)', 'execute') as report,
              has_function_privilege('anon', 'public.record_work_auto_moderation(uuid, boolean, text[])', 'execute') as record,
              has_function_privilege('authenticated', 'public.admin_moderate_works(uuid, uuid[], text, text)', 'execute') as moderate,
              has_table_privilege('authenticated', 'public.work_reports', 'select') as reports,
              (select count(*)::int from pg_policies where tablename = 'work_reports') as policies`,
    )
    expect(rows[0]).toEqual({ report: false, record: false, moderate: false, reports: false, policies: 0 })
    expect((await anonClient().rpc('report_work', { p_job_id: randomUUID(), p_reporter: owner, p_reason: 'spam', p_note: null })).error).not.toBeNull()
  })
})

describe('review reads and the sweep', () => {
  it('lists the queue with the shown text and open reports, counts it, and the sweep screens it', async () => {
    const id = await work()
    const freeform = await work({ templateId: 'freeform' })
    const page = await listReviewWorks({ db: service, store }, 'pending', null)
    const listed = page.works.find((w) => w.id === id)
    expect(listed).toMatchObject({ templateName: 'T108 dish', copy: ['Grilled salmon'], status: 'pending', imageUrl: expect.stringContaining(id) })
    expect(page.works.some((w) => w.id === freeform)).toBe(false)
    expect(await pendingReviewCount(service)).toBeGreaterThan(0)

    const seen: string[] = []
    const screen = async (input: { imageUrl: string; text: string | null }) => {
      seen.push(input.imageUrl)
      expect(input.text === null || !input.text.includes('private note')).toBe(true)
      return { flagged: input.imageUrl.includes(id), categories: input.imageUrl.includes(id) ? ['violence'] : [] }
    }
    let result = await sweepModeration({ db: service, store, screen })
    while (result.seen > 0 && !seen.some((url) => url.includes(id))) result = await sweepModeration({ db: service, store, screen })
    expect(await stateOf(id)).toMatchObject({ status: 'rejected', categories: ['violence'] })
    expect(seen.some((url) => url.includes(freeform))).toBe(false)
  })

  it('a failed screen leaves the work pending and unscreened', async () => {
    const id = await work()
    const status = await screenWork(
      { db: service, store, screen: async () => { throw new Error('down') } },
      { id, output_key: `outputs/${owner}/${id}.png`, parent_job_id: null, inputs: {} },
    )
    expect(status).toBe('skipped')
    expect(await stateOf(id)).toMatchObject({ status: 'pending', screened: false })
  })
})

describe('keeping a reported work', () => {
  it('closes its reports and keeps its place in the gallery', async () => {
    const id = await work()
    await decide({ jobIds: [id], decision: 'approved', reason: null })
    const before = (await db.query('select moderated_at from public.generation_jobs where id = $1', [id])).rows[0].moderated_at
    const reporter = await createUser(db)
    expect((await report(id, reporter)).data).toBe('reported')
    expect(await decide({ jobIds: [id], decision: 'approved', reason: null })).toBe(1)
    const after = (await db.query('select moderated_at from public.generation_jobs where id = $1', [id])).rows[0].moderated_at
    expect(after).toEqual(before)
    expect((await db.query('select count(*)::int as n from public.work_reports where job_id = $1 and resolved_at is null', [id])).rows[0].n).toBe(0)
  })
})
