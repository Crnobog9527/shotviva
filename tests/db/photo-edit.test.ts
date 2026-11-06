import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '@/core/analytics'
import { listAdminTemplates, loadEditTemplateSettings, saveEditTemplate } from '@/core/admin'
import { GenerationFailure, reserveJob } from '@/core/jobs'
import { listTemplates } from '@/core/templates'
import { CREDITS_FLOOR, runEdit, type EditDeps } from '@/modules/image'

import { createMemoryStore } from '../fakes/memory-store'
import { fakeDecider, finishedWork, publishEditTemplate, setEditTemplate, TEST_EDIT_PARAMS, TEST_WRAPPER, type DeciderBehaviour } from './edit-fixtures'
import { fakeProvider, seedTemplate, type FakeBehaviour } from './generation-fixtures'
import { connectAdmin, createUser, profileOf, type TestProfile } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T30 (ARCHITECTURE §5.2): an edit is an ordinary generation on the built-in `edit` template.
// Real local Supabase for reserve/confirm/refund and the parent check; fake R2, fake OpenAI.

let db: Client
let templateId: string
let restore: () => Promise<void>

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
  restore = await publishEditTemplate(db)
})

afterAll(async () => {
  await restore()
  await db.end()
})

type Options = { decider?: DeciderBehaviour | null; provider?: FakeBehaviour; profile?: TestProfile }

// A user with one finished 4:5 work (Standard, 1 credit) and `profile` credits left after it.
async function setup({ decider = { background: 0.9 }, provider = 'ok', profile = { credits: 10 } }: Options = {}) {
  const userId = await createUser(db, { credits: (profile.credits ?? 0) + 1, freeCredits: profile.freeCredits })
  const r2 = createMemoryStore()
  const sourceId = await finishedWork(userId, r2.store, templateId, (key, body) => r2.upload(key, body, 'image/jpeg'))
  const fake = fakeProvider(provider)
  const decision = decider === null ? null : fakeDecider(decider)
  const track = vi.fn<ServerTrack>()
  const deps: EditDeps = {
    db: serviceSupabase(),
    store: r2.store,
    provider: fake.provider,
    decider: decision?.decider ?? null,
    providerTimeoutMs: 200,
    decisionTimeoutMs: 50,
    track,
  }
  const edit = (instruction = 'Put it on a beach', extra: { jobId?: string; resolution?: '2k' } = {}) =>
    runEdit(deps, { userId, sourceJobId: sourceId, instruction, ...extra })
  return { userId, sourceId, r2, fake, decision, deps, track, edit }
}

async function editRow(jobId: string) {
  const { rows } = await db.query<{ template_id: string; parent_job_id: string | null; inputs: Record<string, unknown>; credits_cost: number }>(
    'select template_id, parent_job_id, inputs, credits_cost from public.generation_jobs where id = $1',
    [jobId],
  )
  return rows[0]!
}

describe('runEdit: one ordinary generation on the edit template', () => {
  it('charges the edit price, links the parent and sends wrapper + paragraph + the words as typed', async () => {
    const { userId, sourceId, r2, fake, decision, track, edit } = await setup()
    const view = await edit('Put it on a beach')

    expect(view).toMatchObject({ status: 'succeeded', template_id: 'edit', credits_cost: 2, credit_pool: 'paid' })
    expect((await profileOf(db, userId)).credits).toBe(8)
    expect(r2.objects.has(`outputs/${userId}/${view.id}.png`)).toBe(true)

    const row = await editRow(view.id)
    expect(row.parent_job_id).toBe(sourceId)
    expect(row.inputs).toMatchObject({ instruction: 'Put it on a beach', edit_scope: 'background', aspect_ratio: '4:5', resolution: '1k' })
    expect(row.inputs.edit_probabilities).toMatchObject({ background: 0.9, object: null })
    // The wrapper and paragraphs stay in template_prompts.
    expect(JSON.stringify(row.inputs)).not.toMatch(/WRAPPER|C-[A-Z]|Q-[A-Z]/)

    const [call] = fake.calls
    expect(call?.prompt).toBe(`${TEST_WRAPPER}\n\nC-BACKGROUND\n\nPut it on a beach`)
    expect(call?.images).toHaveLength(1)
    expect(call?.aspectRatio).toBe('4:5')
    expect(call?.params).toEqual({ input_fidelity: 'high' })

    const asked = decision?.decide.mock.calls[0]?.[0]
    expect(asked?.instruction).toBe('Put it on a beach')
    expect(asked?.questions.map((q) => q.text)).toEqual(Object.values(TEST_EDIT_PARAMS.questions))
    expect(asked?.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/)

    expect(track).toHaveBeenCalledWith('generate', expect.objectContaining({ template_id: 'edit', category: 'edit', edit_scope: 'background' }), expect.anything())
  })

  it('keeps Chinese words untranslated and charges the chosen tier', async () => {
    const { fake, edit } = await setup({ decider: { object: 0.8 } })
    const view = await edit('沙发换成蓝色', { resolution: '2k' })
    expect(view.credits_cost).toBe(4)
    expect(fake.calls[0]?.prompt).toBe(`${TEST_WRAPPER}\n\nC-OBJECT\n\n沙发换成蓝色`)
    expect(fake.calls[0]?.resolution).toBe('2k')
  })

  it('edits an edit', async () => {
    const { userId, deps, edit } = await setup()
    const first = await edit()
    const second = await runEdit(deps, { userId, sourceJobId: first.id, instruction: 'Make it brighter' })
    expect(second.status).toBe('succeeded')
    expect((await editRow(second.id)).parent_job_id).toBe(first.id)
  })

  it('charges a replay of the same job id once', async () => {
    const { userId, edit } = await setup()
    const jobId = randomUUID()
    const [a, b] = await Promise.all([edit('Make it brighter', { jobId }), edit('Make it brighter', { jobId })])
    expect(a.id).toBe(jobId)
    expect(b.id).toBe(jobId)
    expect((await profileOf(db, userId)).credits).toBe(8)
  })
})

describe('runEdit: the decision never blocks the edit', () => {
  it.each([
    ['times out', 'hang' as const],
    ['fails', 'fail' as const],
  ])('uses the fallback paragraph when the decision %s', async (_, behaviour) => {
    const { fake, edit } = await setup({ decider: behaviour })
    const view = await edit()
    expect(view.status).toBe('succeeded')
    const row = await editRow(view.id)
    expect(row.inputs).toMatchObject({ edit_scope: 'fallback', edit_probabilities: null })
    expect(fake.calls[0]?.prompt).toBe(`${TEST_WRAPPER}\n\nC-FALLBACK\n\nPut it on a beach`)
  })

  it('uses the fallback below 0.5 and keeps the probabilities for tuning', async () => {
    const { edit } = await setup({ decider: { object: 0.49, style: 0.3 } })
    const row = await editRow((await edit()).id)
    expect(row.inputs).toMatchObject({ edit_scope: 'fallback', edit_probabilities: { object: 0.49, style: 0.3 } })
  })

  it('uses the fallback with no decision provider switched on', async () => {
    const { edit } = await setup({ decider: null })
    expect((await editRow((await edit()).id)).inputs.edit_scope).toBe('fallback')
  })
})

describe('runEdit: only your own finished work, refunded like any generation', () => {
  it("refuses someone else's work without charging", async () => {
    const owner = await setup()
    const other = await createUser(db, { credits: 10 })
    await expect(runEdit(owner.deps, { userId: other, sourceJobId: owner.sourceId, instruction: 'Make it brighter' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await profileOf(db, other)).credits).toBe(10)
  })

  it('refuses a failed work', async () => {
    const { userId, deps, sourceId } = await setup()
    await db.query("update public.generation_jobs set status = 'failed', output_key = null, error_code = 'X' where id = $1", [sourceId])
    await expect(runEdit(deps, { userId, sourceJobId: sourceId, instruction: 'Make it brighter' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it.each([['empty', '   '], ['too long', 'x'.repeat(501)]])('refuses an %s instruction before anything else', async (_, instruction) => {
    const { userId, fake, decision, edit } = await setup()
    await expect(edit(instruction)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(decision?.decide).not.toHaveBeenCalled()
    expect(fake.generate).not.toHaveBeenCalled()
    expect((await profileOf(db, userId)).credits).toBe(10)
  })

  it('refunds a failed edit to the pool it came from', async () => {
    const { userId, edit } = await setup({ provider: 'fail', profile: { freeCredits: 2 } })
    const failure = await edit().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(GenerationFailure)
    expect((failure as GenerationFailure).refunded).toBe(true)
    expect(await profileOf(db, userId)).toMatchObject({ credits: 0, free_credits: 2 })
  })

  it('makes a free edit public, like any free work', async () => {
    const { edit } = await setup({ profile: { freeCredits: 2 } })
    expect(await edit()).toMatchObject({ credit_pool: 'free', visibility: 'public' })
  })

  it('is NOT_FOUND while the edit template is unpublished', async () => {
    const { edit } = await setup()
    await setEditTemplate(db, false, TEST_WRAPPER, TEST_EDIT_PARAMS)
    try {
      await expect(edit()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await setEditTemplate(db, true, TEST_WRAPPER, TEST_EDIT_PARAMS)
    }
  })
})

describe('reserve_credits: the edit rules in the database', () => {
  const reserve = (userId: string, overrides: { templateId?: string; parentJobId?: string | null }) =>
    reserveJob(serviceSupabase(), {
      jobId: randomUUID(),
      userId,
      module: 'image',
      templateId: overrides.templateId ?? 'edit',
      source: 'web',
      parentJobId: overrides.parentJobId ?? null,
    })

  it("refuses another user's parent and a missing one", async () => {
    const { sourceId } = await setup()
    const other = await createUser(db, { credits: 10 })
    await expect(reserve(other, { parentJobId: sourceId })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(reserve(other, { parentJobId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await profileOf(db, other)).credits).toBe(10)
  })

  it('only runs the edit template with a parent, and a parent only on it', async () => {
    const { userId, sourceId } = await setup()
    await expect(reserve(userId, { parentJobId: null })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(reserve(userId, { templateId, parentJobId: sourceId })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('deleting', () => {
  it('keeps an edit when its source is deleted, and deletes edits with the account', async () => {
    const { userId, sourceId, edit } = await setup()
    const view = await edit()
    await db.query('delete from public.generation_jobs where id = $1', [sourceId])
    expect((await editRow(view.id)).parent_job_id).toBeNull()

    await db.query('delete from auth.users where id = $1', [userId])
    const { rows } = await db.query('select id from public.generation_jobs where user_id = $1', [userId])
    expect(rows).toHaveLength(0)
  })
})

// Runs in this file, not its own, because it rewrites the one `edit` row the tests above use.
describe('/admin/templates/edit', () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    isActive: true,
    creditsCost: { '1k': 3, '2k': 5, '3k': 7 },
    wrapper: TEST_WRAPPER,
    params: TEST_EDIT_PARAMS,
    ...overrides,
  })

  it('saves price, texts and switch, and keeps the template on no surface', async () => {
    const adminId = await createUser(db)
    await saveEditTemplate(serviceSupabase(), adminId, input(), CREDITS_FLOOR)
    const settings = await loadEditTemplateSettings(serviceSupabase())
    expect(settings).toMatchObject({ isActive: true, creditsCost: { '1k': 3, '2k': 5, '3k': 7 }, wrapper: TEST_WRAPPER, params: TEST_EDIT_PARAMS })
    const { rows } = await db.query<{ visible_in: string[] }>("select visible_in from public.templates where id = 'edit'")
    expect(rows[0]?.visible_in).toEqual([])
    // Published, yet in no catalogue and not in the ordinary template editor.
    expect((await listTemplates(anonSupabase(), 'web')).map((t) => t.id)).not.toContain('edit')
    expect((await listTemplates(anonSupabase(), 'partner')).map((t) => t.id)).not.toContain('edit')
    expect((await listAdminTemplates(serviceSupabase())).map((t) => t.id)).not.toContain('edit')
    await saveEditTemplate(serviceSupabase(), adminId, input({ creditsCost: { '1k': 2, '2k': 4, '3k': 6 } }), CREDITS_FLOOR)
  })

  it('refuses a price under the floor and a missing question', async () => {
    const adminId = await createUser(db)
    await expect(saveEditTemplate(serviceSupabase(), adminId, input({ creditsCost: { '1k': 1, '2k': 1, '3k': 1 } }), CREDITS_FLOOR)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const params = { ...TEST_EDIT_PARAMS, questions: { ...TEST_EDIT_PARAMS.questions, subject: '' } }
    await expect(saveEditTemplate(serviceSupabase(), adminId, input({ params }), CREDITS_FLOOR)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
