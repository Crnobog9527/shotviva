import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isInvited, loadFeatureAccess, requireFeature } from '@/core/features'
import { runGeneration, type GenerationRequest } from '@/core/jobs'
import { POSTER_FEATURE, savePosterSet } from '@/core/poster/sets'

import { runPosterCheck } from '@/modules/image/poster'

import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider } from './generation-fixtures'
import { connectAdmin, createUser, publishFixture } from './helpers'
import { serviceSupabase } from './supabase-env'

// Dense-text posters (ARCHITECTURE §5.3, 1314): a confirmed set is saved, each poster is an
// ordinary generation job whose prompt carries that poster's text, read back from the set.

let db: Client
let templateId: string
const service = serviceSupabase()
const allow = (userId: string) =>
  requireFeature(userId, POSTER_FEATURE, { loadAccess: () => loadFeatureAccess(service), invited: (id, key) => isInvited(service, id, key) })

const poster = {
  kinds: [
    { key: 'prizes', name: { en: 'Prizes', zh: '奖品' }, blocks: ['header', 'prizes', 'footer'], capacity: { prizeRows: 3 } },
    { key: 'rules', name: { en: 'Rules', zh: '规则' }, blocks: ['header', 'table', 'footer'] },
  ],
}

beforeAll(async () => {
  db = await connectAdmin()
  templateId = `poster-${randomUUID().slice(0, 8)}`
  const fields = { images: { min: 0, max: 0 }, copy: [], aspectRatios: ['1:2', '9:16'], poster }
  await db.query(
    `insert into public.templates (id, name, category, fields, quality, credits_cost, is_active, visible_in)
     values ($1, 'Poster test', 'pets', $2, 'medium', '{"1k": 1, "2k": 2, "3k": 3}', false, '{web}')`,
    [templateId, JSON.stringify(fields)],
  )
  await db.query('insert into public.template_prompts (template_id, body, model_params) values ($1, $2, $3)',
    [templateId, 'LAYOUT poster in {{aspect_ratio}}', JSON.stringify({ poster_check: { instructions: 'READ IT' } })])
  await publishFixture(db, templateId)
})

afterAll(async () => {
  await db.end()
})

const content = {
  header: { title: '周6大师赛', datetimeLabel: '开赛时间', datetime: '14:00' },
  prizes: { headline: '奖励前4名', rows: ['冠军', '亚军', '季军', '第四名'].map((rank, i) => ({ rank, prize: `奖品${i + 1}` })) },
  table: { columns: ['级别', '基础分'], rows: [['1', '100'], { break: '休息10分钟' }, ['2', '200']] },
  footer: { phones: ['188 0000 1234'], address: '云川市滨江区' },
}

async function invitedUser() {
  const userId = await createUser(db, { credits: 10 })
  await db.query('insert into public.feature_user_grants (feature_key, user_id) values ($1, $2)', [POSTER_FEATURE, userId])
  return userId
}

function generate(userId: string, overrides: Partial<GenerationRequest> = {}) {
  const fake = fakeProvider('ok')
  const memory = createMemoryStore()
  const checked: string[] = []
  const deps = { db: service, store: memory.store, provider: fake.provider, providerTimeoutMs: 500, allowPoster: allow, afterPoster: (job: { id: string }) => { checked.push(job.id) } }
  const request: GenerationRequest = { userId, source: 'web', templateId, aspectRatio: '1:2', ...overrides }
  return { fake, checked, store: memory.store, run: () => runGeneration(deps, request) }
}

const reader = (lines: string[]) => ({
  credentials: async () => ({ tag: 'decision/fake', adapter: 'openai_responses' as const, config: { baseUrl: 'https://api.example.test/v1', model: 'fake', apiKey: 'k' },
    prices: { inputTextPerM: 0.2, outputPerM: 1.6 } as never }),
  fetch: async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ lines }) }] }], usage: { input_tokens: 3000, output_tokens: 200 } }),
})

describe('poster sets and generation', () => {
  it('splits the set, makes each poster from its own text and records which poster it is', async () => {
    const userId = await invitedUser()
    const set = await savePosterSet(service, { userId, templateId, fields: { poster }, content, source: 'paste', allow })
    expect(set.parts.map((part) => `${part.kind} ${part.page}/${part.pages}`)).toEqual(['prizes 1/2', 'prizes 2/2', 'rules 1/1'])

    const { fake, run } = generate(userId, { poster: { setId: set.id, part: 1 } })
    const view = await run()
    expect(view.status).toBe('succeeded')
    expect(fake.calls[0]?.prompt).toContain('LAYOUT poster in 1:2')
    expect(fake.calls[0]?.prompt).toContain('Row 1: 第四名 | 奖品4')
    expect(fake.calls[0]?.prompt).not.toContain('冠军')
    const { rows } = await db.query('select inputs from public.generation_jobs where id = $1', [view.id])
    expect(rows[0].inputs.poster).toEqual({ set_id: set.id, part: 1, kind: 'prizes', page: 2, pages: 2 })
  })

  it('refuses a poster template job without a set, and a set of someone else', async () => {
    const userId = await invitedUser()
    await expect(generate(userId).run()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const other = await invitedUser()
    const set = await savePosterSet(service, { userId: other, templateId, fields: { poster }, content, source: 'paste', allow })
    await expect(generate(userId, { poster: { setId: set.id, part: 0 } }).run()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('is closed to an account that was not invited', async () => {
    const userId = await createUser(db, { credits: 10 })
    await expect(savePosterSet(service, { userId, templateId, fields: { poster }, content, source: 'paste', allow })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lets owners read their own sets and nobody else, and never write them', async () => {
    const privileges = await db.query(`select has_table_privilege('authenticated', 'public.poster_sets', 'insert') as ins,
      has_table_privilege('authenticated', 'public.poster_sets', 'select') as sel,
      has_table_privilege('authenticated', 'public.poster_extractions', 'select') as ext`)
    expect(privileges.rows[0]).toEqual({ ins: false, sel: true, ext: false })
    const policy = await db.query("select qual from pg_policies where tablename = 'poster_sets'")
    expect(policy.rows[0].qual).toContain('auth.uid()')
  })

  it('checks a finished poster: schedules it, records the lines that differ, and does it once', async () => {
    const userId = await invitedUser()
    const set = await savePosterSet(service, { userId, templateId, fields: { poster }, content, source: 'paste', allow })
    const job = generate(userId, { poster: { setId: set.id, part: 2 } })
    const view = await job.run()
    expect(job.checked).toEqual([view.id])
    const check = { db: service, store: job.store, ...reader(['周6大师赛 开赛时间 14:00', '级别 基础分', '1 100', '休息10分钟', '2 280', '188 0000 1234 云川市滨江区']) }
    expect(await runPosterCheck(check, view.id)).toBe('mismatch')
    const { rows } = await db.query('select status, diffs, input_tokens, cost_usd from public.poster_checks where job_id = $1', [view.id])
    expect(rows[0]).toMatchObject({ status: 'mismatch', input_tokens: 3000, cost_usd: '0.000920' })
    expect(rows[0].diffs).toEqual([{ path: 'table.rows.2', expected: '2 200', seen: '2 280' }])
    await runPosterCheck({ ...check, ...reader([]) }, view.id)
    expect((await db.query('select status from public.poster_checks where job_id = $1', [view.id])).rows[0].status).toBe('mismatch')
  })
})
