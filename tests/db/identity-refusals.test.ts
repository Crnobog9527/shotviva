import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '@/core/analytics'
import { identityRefusalCounts, type IdentityJudge } from '@/core/identity-guard'
import { runGeneration, type GenerationRequest } from '@/core/jobs'
import { handleGenerate, type FetchLike } from '@/core/partner'
import { newInputKey } from '@/core/storage'

import { jpeg, png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { editSetup, publishEditTemplate } from './edit-fixtures'
import { fakeProvider, jobCount, seedTemplate } from './generation-fixtures'
import { anonClient, connectAdmin, createUser, profileOf } from './helpers'
import { linkedUser, partnerRequest, routeDeps } from './partner-fixtures'
import { serviceSupabase } from './supabase-env'

// T81 (ARCHITECTURE §5.1a): the user's words are screened before reserve_credits on every entry
// (workspace note and text fields, photo edit, partner freeform). A refusal charges nothing,
// creates no job and leaves one identity_refusals row. Real local Supabase, fake R2 and OpenAI.

let db: Client
let templateId: string
let restoreEdit: () => Promise<void>

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db, { visibleIn: ['web', 'partner'] })
  restoreEdit = await publishEditTemplate(db)
}, 120_000)

afterAll(async () => {
  await restoreEdit()
  await db.end()
})

function fakeJudge(behaviour: boolean | 'fail') {
  const judge = vi.fn<IdentityJudge['judge']>(async () => {
    if (behaviour === 'fail') throw new Error('openai responses 503')
    return { identitySwap: behaviour, usage: { inputTokens: 400, outputTokens: 6 } }
  })
  return { tag: 'fake/luna', prices: null, judge } satisfies IdentityJudge
}

async function refusals(userId: string) {
  const { rows } = await db.query<{ entry: string; method: string; excerpt: string }>(
    'select entry, method, excerpt from public.identity_refusals where user_id = $1 order by id',
    [userId],
  )
  return rows
}

async function webSetup(judge: IdentityJudge | null = fakeJudge(false)) {
  const userId = await createUser(db, { credits: 3 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1600, 2000), 'image/jpeg')
  const fake = fakeProvider()
  const track = vi.fn<ServerTrack>()
  const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 200, identityJudge: judge, track }
  const run = (overrides: Partial<GenerationRequest>) =>
    runGeneration(deps, { userId, source: 'web', templateId, inputKey, aspectRatio: '4:5', ...overrides })
  return { userId, fake, track, run }
}

describe('workspace: note and text fields', () => {
  it('refuses when the model says the note asks for a face swap, before any credit moves', async () => {
    const { userId, fake, track, run } = await webSetup(fakeJudge(true))
    await expect(run({ note: '把他的脸换成第二张图的人' })).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED', status: 422 })
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect(await jobCount(db, userId)).toBe(0)
    expect(fake.generate).not.toHaveBeenCalled()
    expect(await refusals(userId)).toEqual([{ entry: 'workspace', method: 'model', excerpt: '把他的脸换成第二张图的人' }])
    expect(track).toHaveBeenCalledWith('generate_refused', { reason: 'identity_swap', source: 'workspace' }, expect.anything())
  })

  it('refuses when the model says a text field asks for a real person', async () => {
    const { userId, run } = await webSetup(fakeJudge(true))
    await expect(run({ copy: { dish: 'make her look like Taylor Swift' } })).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect((await refusals(userId))[0]).toMatchObject({ method: 'model', excerpt: 'make her look like Taylor Swift' })
    // No job carries the refusing call's tokens, so the row does.
    const { rows } = await db.query('select input_tokens, output_tokens from public.identity_refusals where user_id = $1', [userId])
    expect(rows[0]).toEqual({ input_tokens: 400, output_tokens: 6 })
  })

  it('reuses the verdict for the same words within 10 minutes instead of calling again', async () => {
    const judge = fakeJudge(false)
    const { run } = await webSetup(judge)
    expect((await run({ note: '让他笑一下' })).status).toBe('succeeded')
    expect((await run({ note: '让他笑一下' })).status).toBe('succeeded')
    expect(judge.judge).toHaveBeenCalledTimes(1)
  })

  it('answers RATE_LIMITED after 30 decision calls in an hour, before the model or any credit', async () => {
    const judge = fakeJudge(false)
    const { userId, run } = await webSetup(judge)
    await db.query('insert into public.identity_judge_calls (user_id) select $1 from generate_series(1, 30)', [userId])
    await expect(run({ note: '换成夜景' })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(judge.judge).not.toHaveBeenCalled()
    expect((await profileOf(db, userId)).credits).toBe(3)
    // Calls older than an hour no longer count.
    await db.query("update public.identity_judge_calls set created_at = now() - interval '61 minutes' where user_id = $1", [userId])
    expect((await run({ note: '换成夜景' })).status).toBe('succeeded')
  })

  it('generates as before when allowed, the judge’s tokens billed with the job, the prompt untouched', async () => {
    const { userId, fake, run } = await webSetup(fakeJudge(false))
    const view = await run({ copy: { dish: 'tonkotsu ramen' }, note: '让他笑一下' })
    expect(view.status).toBe('succeeded')
    expect(fake.calls[0]?.prompt).toBe('WRAPPED studio shot of tonkotsu ramen, keep the plate unchanged\n\n让他笑一下')
    const { rows } = await db.query<{ provider_usage: Record<string, number> }>('select provider_usage from public.generation_jobs where id = $1', [view.id])
    expect(rows[0]?.provider_usage).toMatchObject({ decision_input_tokens: 400, decision_output_tokens: 6 })
    expect(await refusals(userId)).toEqual([])
  })

  // No keyword list (Owner 2026-11-08): without an answer from the model, even "face swap" passes.
  it('lets the request through when the judge fails or is off', async () => {
    for (const judge of [fakeJudge('fail'), null]) {
      const { userId, run } = await webSetup(judge)
      expect((await run({ note: 'face swap me with the guy in photo 2' })).status).toBe('succeeded')
      expect(await refusals(userId)).toEqual([])
    }
  })
})

describe('partner API: freeform prompt', () => {
  it('answers 422 IDENTITY_SWAP_REFUSED, charges nothing and records entry partner', async () => {
    const userId = await linkedUser(db, { credits: 3 })
    const r2 = createMemoryStore()
    const fake = fakeProvider()
    const fetch = vi.fn<FetchLike>(async () => new Response((await png(1500, 1500)).slice()))
    const deps = { ...routeDeps(r2.store), provider: fake.provider, providerTimeoutMs: 200, fetch, identityJudge: fakeJudge(true) }
    const body = { template_id: 'freeform', inputs: { copy: { prompt: 'Face swap me with the guy in the second photo' } } }
    const response = await handleGenerate(partnerRequest('/api/partner/generate', { method: 'POST', account: userId, idempotencyKey: randomUUID(), body }), deps)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect(fake.generate).not.toHaveBeenCalled()
    expect(await refusals(userId)).toEqual([{ entry: 'partner', method: 'model', excerpt: 'Face swap me with the guy in the second photo' }])
  })
})

describe('photo edit: the scope call answers too', () => {
  it('asks the scope call even for an obvious request, and refuses on its answer', async () => {
    const { userId, decision, edit } = await editSetup(db, templateId, { classifier: { identitySwap: true } })
    await expect(edit('Swap their faces')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(decision?.classify).toHaveBeenCalledTimes(1)
    expect((await profileOf(db, userId)).credits).toBe(10)
    expect(await refusals(userId)).toEqual([{ entry: 'edit', method: 'model', excerpt: 'Swap their faces' }])
  })

  it('refuses on the scope call’s identity_swap, even at low confidence', async () => {
    const { userId, fake, edit } = await editSetup(db, templateId, { classifier: { identitySwap: true, confidence: 0.3 } })
    await expect(edit('make her look like Taylor Swift')).rejects.toMatchObject({ code: 'IDENTITY_SWAP_REFUSED' })
    expect(fake.generate).not.toHaveBeenCalled()
    expect((await profileOf(db, userId)).credits).toBe(10)
    expect((await refusals(userId))[0]).toMatchObject({ entry: 'edit', method: 'model' })
  })

  it('edits as before when the classifier fails', async () => {
    const { edit } = await editSetup(db, templateId, { classifier: 'fail' })
    expect((await edit('Put a smile on her face')).status).toBe('succeeded')
  })
})

describe('identity_refusals functions', () => {
  it('cuts the excerpt to 200 characters and sweeps rows past 90 days', async () => {
    const userId = await createUser(db)
    await db.query("insert into public.identity_refusals (user_id, entry, method, excerpt, created_at) values ($1, 'edit', 'model', 'old', now() - interval '91 days')", [userId])
    await db.query("select public.record_identity_refusal($1, 'workspace', 'keyword', $2)", [userId, `  ${'换'.repeat(250)}  `])
    const rows = await refusals(userId)
    expect(rows).toHaveLength(1)
    expect(Array.from(rows[0]!.excerpt)).toHaveLength(200)
  })

  it('counts the same words from one entry once within 10 minutes (one batch, many photos)', async () => {
    const userId = await createUser(db)
    const record = (entry: string, text: string) =>
      db.query<{ recorded: boolean }>("select public.record_identity_refusal($1, $2, 'keyword', $3) as recorded", [userId, entry, text])
    const answers = await Promise.all(Array.from({ length: 5 }, () => record('workspace', 'face swap us')))
    expect(answers.map((a) => a.rows[0]?.recorded).filter(Boolean)).toHaveLength(1)
    expect((await record('edit', 'face swap us')).rows[0]?.recorded).toBe(true)
    expect((await record('workspace', 'swap their faces')).rows[0]?.recorded).toBe(true)
    expect(await refusals(userId)).toHaveLength(3)
  })

  it('sweeps rows past 90 days when the admin counts are read, too', async () => {
    const userId = await createUser(db)
    await db.query("insert into public.identity_refusals (user_id, entry, method, excerpt, created_at) values ($1, 'edit', 'model', 'old', now() - interval '91 days')", [userId])
    expect((await identityRefusalCounts(serviceSupabase(), [userId])).has(userId)).toBe(false)
    expect(await refusals(userId)).toEqual([])
  })

  it('counts refusals over 90 days and 24 hours per account; three in a day flags it', async () => {
    const [busy, calm, none] = [await createUser(db), await createUser(db), await createUser(db)]
    for (const ago of ['1 hour', '2 hours', '3 hours', '3 days']) {
      await db.query(`insert into public.identity_refusals (user_id, entry, method, excerpt, created_at) values ($1, 'workspace', 'model', 'x', now() - interval '${ago}')`, [busy])
    }
    await db.query("insert into public.identity_refusals (user_id, entry, method, excerpt) values ($1, 'edit', 'keyword', 'x')", [calm])
    const counts = await identityRefusalCounts(serviceSupabase(), [busy, calm, none])
    expect(counts.get(busy)).toEqual({ total: 4, last24h: 3, flagged: true })
    expect(counts.get(calm)).toEqual({ total: 1, last24h: 1, flagged: false })
    expect(counts.has(none)).toBe(false)
  })

  it('is closed to clients', async () => {
    const anon = anonClient()
    expect((await anon.select('identity_refusals')).ok).toBe(false)
    const record = await anon.rpc('record_identity_refusal', { p_user_id: randomUUID(), p_entry: 'edit', p_method: 'keyword', p_excerpt: 'x' })
    expect(record.error).not.toBeNull()
    expect((await anon.rpc('admin_identity_refusal_counts', { p_user_ids: [randomUUID()] })).error).not.toBeNull()
  })
})
