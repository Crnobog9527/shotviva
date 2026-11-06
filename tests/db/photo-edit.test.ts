import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAdminTemplates, loadEditTemplateSettings, saveEditTemplate } from '@/core/admin'
import { GenerationFailure, ProviderError, reserveJob, type GenerationProvider, type ProviderPrices } from '@/core/jobs'
import { listTemplates } from '@/core/templates'
import { CREDITS_FLOOR, runEdit } from '@/modules/image'

import { png } from '../fakes/images'
import {
  editJobRow,
  editSetup,
  publishEditTemplate,
  setEditTemplate,
  TEST_EDIT_PARAMS,
  TEST_WRAPPER,
  type ClassifierBehaviour,
  type EditOptions,
} from './edit-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T30 (ARCHITECTURE §5.2): an edit is an ordinary generation on the built-in `edit` template.
// Real local Supabase for reserve/confirm/refund and the parent check; fake R2, fake OpenAI.

let db: Client
let templateId: string
let restore: () => Promise<void>

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
  // Waits while another file holds the edit template (edit-fixtures), hence the long timeout.
  restore = await publishEditTemplate(db)
}, 120_000)

afterAll(async () => {
  await restore()
  await db.end()
})

const setup = (options?: EditOptions) => editSetup(db, templateId, options)
const editRow = (jobId: string) => editJobRow(db, jobId)

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
    expect(row.inputs).toMatchObject({ confidence: 0.9, keep: ['amber bottle'], change: 'beach background' })
    // The wrapper and paragraphs stay in template_prompts.
    expect(JSON.stringify(row.inputs)).not.toMatch(/WRAPPER|C-[A-Z]|CLASSIFIER/)

    const [call] = fake.calls
    expect(call?.prompt).toBe(`${TEST_WRAPPER}\n\nC-BACKGROUND Keep unchanged: amber bottle.\n\nPut it on a beach`)
    expect(call?.images).toHaveLength(1)
    expect(call?.aspectRatio).toBe('4:5')
    expect(call?.params).toEqual({ input_fidelity: 'high' })

    const asked = decision?.classify.mock.calls[0]?.[0]
    expect(asked?.instruction).toBe('Put it on a beach')
    expect(asked?.instructions).toBe(TEST_EDIT_PARAMS.classifier)
    expect(asked?.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/)

    expect(track).toHaveBeenCalledWith('generate', expect.objectContaining({ template_id: 'edit', category: 'edit', edit_scope: 'background' }), expect.anything())
  })

  it('keeps Chinese words untranslated and charges the chosen tier', async () => {
    const { fake, edit } = await setup({ classifier: { scope: 'subject', confidence: 0.8 } })
    const view = await edit('把模特换成男生', { resolution: '2k' })
    expect(view.credits_cost).toBe(4)
    // A subject swap gets no keep list.
    expect(fake.calls[0]?.prompt).toBe(`${TEST_WRAPPER}\n\nC-SUBJECT\n\n把模特换成男生`)
    expect(fake.calls[0]?.resolution).toBe('2k')
  })

  // T47: the panel offers the eight sizes; another size than the work's is sent to the model.
  it("makes the edit at the size asked for, the work's own when none is", async () => {
    const { fake, edit } = await setup()
    const view = await edit('Put it on a beach', { aspect: '16:9' })
    expect((await editRow(view.id)).inputs).toMatchObject({ aspect_ratio: '16:9' })
    expect(fake.calls[0]?.aspectRatio).toBe('16:9')
    expect(fake.calls[0]?.prompt).toMatch(/Put it on a beach\n\nC-REFRAME$/)
  })

  it("asks for the work's own size without the reframe paragraph", async () => {
    const { fake, edit } = await setup()
    await edit('Put it on a beach', { aspect: '4:5' })
    expect(fake.calls[0]?.aspectRatio).toBe('4:5')
    expect(fake.calls[0]?.prompt).not.toContain('C-REFRAME')
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

describe('runEdit: the classifier never blocks the edit', () => {
  it.each([
    ['times out', 'hang' as const],
    ['fails', 'fail' as const],
  ])('uses the fallback paragraph when the classifier %s', async (_, behaviour) => {
    const { fake, edit } = await setup({ classifier: behaviour })
    const view = await edit()
    expect(view.status).toBe('succeeded')
    const row = await editRow(view.id)
    expect(row.inputs).toMatchObject({ edit_scope: 'fallback', confidence: null, keep: [], change: null })
    expect(fake.calls[0]?.prompt).toBe(`${TEST_WRAPPER}\n\nC-FALLBACK\n\nPut it on a beach`)
  })

  it('uses the fallback below 0.5, without the keep list, and records the answer for tuning', async () => {
    const { fake, edit } = await setup({ classifier: { scope: 'object', confidence: 0.49 } })
    const row = await editRow((await edit()).id)
    expect(row.inputs).toMatchObject({ edit_scope: 'fallback', confidence: 0.49, keep: ['amber bottle'] })
    expect(fake.calls[0]?.prompt).toBe(`${TEST_WRAPPER}\n\nC-FALLBACK\n\nPut it on a beach`)
  })

  it('uses the fallback with no decision provider switched on', async () => {
    const { edit } = await setup({ classifier: null })
    expect((await editRow((await edit()).id)).inputs.edit_scope).toBe('fallback')
  })
})

describe("runEdit: the decision step's tokens are costed with the image call (T33)", () => {
  const IMAGE_PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
  const IMAGE_USAGE = { input_text_tokens: 1000, input_image_tokens: 2000, output_tokens: 4000 }
  const LUNA: ProviderPrices = { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 }
  // fakeClassifier reports 800 input and 30 output tokens.
  const USAGE = { ...IMAGE_USAGE, decision_input_tokens: 800, decision_output_tokens: 30 }
  // $0.141 for the image call, plus 800 × $0.10 + 30 × $0.50 per million.
  const COST = '0.141095'

  const billed = (fail: boolean): GenerationProvider => ({
    id: 'fake-openai',
    prices: IMAGE_PRICES,
    generate: async () => {
      if (fail) throw new ProviderError('failed', 'openai returned no image', { usage: IMAGE_USAGE })
      return { bytes: await png(64, 80), contentType: 'image/png' as const, usage: IMAGE_USAGE }
    },
  })

  async function costOfEdit(classifier: ClassifierBehaviour, decisionPrices: ProviderPrices | null = LUNA, fail = false) {
    const { deps, decision, edit } = await setup({ classifier })
    deps.provider = billed(fail)
    if (decision) decision.classifier.prices = decisionPrices
    const view = await edit().catch((error: GenerationFailure) => ({ id: error.jobId }))
    const { rows } = await db.query('select status, provider_usage, cost_usd from public.generation_jobs where id = $1', [view.id])
    return rows[0]
  }

  it('adds the decision tokens to provider_usage and prices them at the decision row', async () => {
    expect(await costOfEdit({})).toEqual({ status: 'succeeded', provider_usage: USAGE, cost_usd: COST })
  })

  it('records them on a refunded edit too', async () => {
    expect(await costOfEdit({}, LUNA, true)).toEqual({ status: 'failed', provider_usage: USAGE, cost_usd: COST })
  })

  it('leaves the cost empty while the decision row has no prices, and costs a failed classifier as no step', async () => {
    expect(await costOfEdit({}, null)).toMatchObject({ provider_usage: USAGE, cost_usd: null })
    expect(await costOfEdit('fail')).toMatchObject({ provider_usage: IMAGE_USAGE, cost_usd: '0.141000' })
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
    expect(decision?.classify).not.toHaveBeenCalled()
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

  it('refuses a price under the floor and missing classifier instructions', async () => {
    const adminId = await createUser(db)
    await expect(saveEditTemplate(serviceSupabase(), adminId, input({ creditsCost: { '1k': 1, '2k': 1, '3k': 1 } }), CREDITS_FLOOR)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const params = { ...TEST_EDIT_PARAMS, classifier: '' }
    await expect(saveEditTemplate(serviceSupabase(), adminId, input({ params }), CREDITS_FLOOR)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
