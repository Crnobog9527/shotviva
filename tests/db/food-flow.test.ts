import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteDishware, listDishware, saveDishware } from '@/core/dishware'
import { runGeneration, type DishReader, type DishReading, type FoodDeps } from '@/core/jobs'
import { confirmTestPhoto, runTestGenerate, saveTestBudget } from '@/modules/image'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider } from './generation-fixtures'
import { connectAdmin, createUser, publishFixture } from './helpers'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

// ARCHITECTURE §5.1c「餐饮开关的出图流程」: the toggle pair picks the flow, the dish is read only
// once credits are held, a failed reading still makes (and charges) the ordinary image, and the
// vessel library is written only by admins. Fake prompts and a fake reader only.

const NOW = new Date('2026-11-15T12:00:00.000Z')
const FLOW = { read: 'READ', dishware: 'DISHWARE', plating: 'PLATING {{food_dish}}', plating_vessel: 'VESSEL {{food_vessel}}' }
const READING: DishReading = { dish_name: 'Fish', main_ingredients: [], sauce: '', garnish: [], dishware: 'white plate', category: 'long' }

let db: Client
let templateId: string
let admin: string
const r2 = createMemoryStore()
const refKey = (id: string) => `style-refs/${id}/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}.webp`
const vesselId = randomUUID()
const vesselKey = `dishware/${vesselId}-0123456789abcdef.webp`
const vesselBytes = Uint8Array.of(5, 6, 7)

async function seedTemplate() {
  const id = `food-${randomUUID().slice(0, 8)}`
  const fields = {
    images: { min: 1, max: 1 }, copy: [], aspectRatios: ['2:3'],
    toggles: [{ key: 'plating', label: 'Plating', default: false }, { key: 'tableware', label: 'Tableware', default: false }],
  }
  const { error } = await serviceSupabase().rpc('admin_upsert_template', {
    p_template: { id, name: 'Food flow', category: 'pets', quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 },
      visible_in: ['web'], is_active: false, fields },
    p_prompt: { body: 'ORDINARY {{plating}} {{tableware}}', model_params: {
      toggles: { plating: { on: 'P-ON', off: 'P-OFF' }, tableware: { on: 'T-ON', off: 'T-OFF' } }, food_flow: FLOW } },
    p_style_refs: [{ key: refKey(id), width: 16, height: 24, uploadedAt: NOW.toISOString() }],
  })
  expect(error).toBeNull()
  await publishFixture(db, id)
  r2.upload(refKey(id), Uint8Array.of(1, 2), 'image/webp')
  return id
}

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  r2.upload(vesselKey, vesselBytes, 'image/webp')
})

afterAll(async () => {
  await db.query('delete from public.dishware_library where id = $1', [vesselId])
  await db.end()
})

const vessel = { id: vesselId, label: 'long-a', category: 'long' as const, shape: 'teardrop platter', imageKey: vesselKey, width: 4, height: 3, isActive: true }

// Counts what the flow touched: a dish reading or a vessel library read is extra cost.
const touched = { reads: 0, vessels: 0 }

function food(reading: DishReading | Error): FoodDeps {
  const reader: DishReader = { tag: 'judge/fake', prices: { inputTextPerM: 1, inputImagePerM: null, outputPerM: 2 }, read: async () => {
    touched.reads += 1
    if (reading instanceof Error) throw reading
    return { reading, usage: { inputTokens: 1000, outputTokens: 100 } }
  } }
  return { reader: async () => reader, vessels: async () => { touched.vessels += 1; return [vessel] }, random: () => 0 }
}

// switchOn: the site-wide food_toggles_enabled (1848); these flows only run while it is on.
// A 1K job, which free credits pay (1996).
async function generate(toggles: { plating: boolean; tableware: boolean }, reading: DishReading | Error = READING, switchOn: boolean | 'absent' = true) {
  const userId = await createUser(db, { freeCredits: 3 })
  const inputKey = newInputKey(userId, 'image/jpeg')
  const photo = await jpeg(1200, 1600)
  r2.upload(inputKey, photo, 'image/jpeg')
  const fake = fakeProvider()
  const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 2000, now: () => NOW, food: food(reading),
    ...(switchOn === 'absent' ? {} : { foodTogglesEnabled: async () => switchOn }) }
  const view = await runGeneration(deps, { userId, source: 'web', templateId, inputKey, toggles })
  const { rows } = await db.query('select status, credits_cost, provider_usage, inputs from public.generation_jobs where id = $1', [view.id])
  return { call: fake.calls[0]!, job: rows[0], images: fake.calls[0]!.images.map((image) => image.bytes.length) }
}

describe('food toggle flows (§5.1c)', () => {
  it('both off is the ordinary call, with no reading', async () => {
    const { call, job } = await generate({ plating: false, tableware: false })
    expect(call.prompt).toBe('ORDINARY P-OFF T-OFF')
    expect(call.images).toHaveLength(2)
    expect(job.provider_usage).toBeNull()
  })

  it('runs each flow once its toggles are on, at the template price', async () => {
    await saveDishware({ db: serviceSupabase(), store: r2.store }, admin, vessel)
    const tableware = await generate({ plating: false, tableware: true })
    expect(tableware.call.prompt).toBe('DISHWARE')
    expect(tableware.call.images[1]?.bytes).toEqual(vesselBytes)
    expect(tableware.call.images).toHaveLength(3)
    const plating = await generate({ plating: true, tableware: false })
    expect(plating.call.prompt).toBe('PLATING Fish')
    expect(plating.call.images.map((image) => image.bytes)).toEqual([Uint8Array.of(1, 2)])
    const both = await generate({ plating: true, tableware: true })
    expect(both.call.prompt).toBe('VESSEL teardrop platter')
    for (const run of [tableware, plating, both]) {
      expect(run.job).toMatchObject({ status: 'succeeded', credits_cost: 1, provider_usage: { decision_input_tokens: 1000, decision_output_tokens: 100 } })
      // The toggles are the user's choice; the flow itself is not stored on the job.
      expect(Object.keys(run.job.inputs.toggles)).toEqual(['plating', 'tableware'])
    }
  })

  it('a failed reading still makes the ordinary image, both toggles off, and succeeds', async () => {
    const { call, job } = await generate({ plating: true, tableware: true }, new Error('timeout'))
    expect(call.prompt).toBe('ORDINARY P-OFF T-OFF')
    expect(job).toMatchObject({ status: 'succeeded', credits_cost: 1 })
  })
})

describe('the site-wide switch off (1848)', () => {
  for (const switchOn of [false, 'absent'] as const) {
    it(`renders both off, reads no dish and no vessel, at the same price (switch ${String(switchOn)})`, async () => {
      await saveDishware({ db: serviceSupabase(), store: r2.store }, admin, vessel)
      const before = { ...touched }
      const off = await generate({ plating: false, tableware: false }, READING, switchOn)
      for (const toggles of [{ plating: true, tableware: false }, { plating: false, tableware: true }, { plating: true, tableware: true }]) {
        const run = await generate(toggles, READING, switchOn)
        // Exactly today's ordinary call with both toggles off: the off fragments, photo + reference.
        expect(run.call.prompt).toBe('ORDINARY P-OFF T-OFF')
        expect(run.images).toEqual(off.images)
        expect(run.job).toMatchObject({ status: 'succeeded', credits_cost: off.job.credits_cost, provider_usage: null })
        expect(run.job.inputs.toggles).toEqual({ plating: false, tableware: false })
        expect(run.job.inputs).not.toHaveProperty('toggles_confirmed_at')
      }
      expect(touched).toEqual(before)
    })
  }

  it('keeps the template setup, so the switch on runs the flow again', async () => {
    const { rows } = await db.query('select model_params from public.template_prompts where template_id = $1', [templateId])
    expect(rows[0].model_params.food_flow).toEqual(FLOW)
    expect((await generate({ plating: true, tableware: false })).call.prompt).toBe('PLATING Fish')
  })
})

// Admin test runs (§10.b) follow the same switch: off, both render off and nothing is read.
describe('admin test runs and the switch (1848)', () => {
  let release: () => Promise<void>
  beforeAll(async () => { release = await holdTestBudget(db) }, 120_000)
  afterAll(async () => { await release() })

  async function testRun(switchOn: boolean) {
    await saveTestBudget(serviceSupabase(), admin, 1000)
    const photoId = randomUUID()
    const key = `admin-tests/photos/${photoId}.jpg`
    r2.upload(key, await jpeg(1200, 1600), 'image/jpeg')
    await confirmTestPhoto({ db: serviceSupabase(), store: r2.store }, admin, photoId, key)
    const fake = fakeProvider()
    const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 2000, food: food(READING), foodTogglesEnabled: async () => switchOn }
    const run = await runTestGenerate(deps, { actorId: admin, body: {
      run_id: randomUUID(), batch_id: randomUUID(), template_id: templateId, photo_id: photoId,
      inputs: { copy: {}, resolution: '1k', aspect_ratio: '2:3', toggles: { plating: true, tableware: false } },
    } })
    return { prompt: fake.calls[0]?.prompt, run }
  }

  it('renders both off with the switch off, and runs the flow with it on', async () => {
    const before = { ...touched }
    const off = await testRun(false)
    expect(off.prompt).toBe('ORDINARY P-OFF T-OFF')
    expect(off.run.inputs.toggles).toEqual({ plating: false, tableware: false })
    expect(touched).toEqual(before)
    expect((await testRun(true)).prompt).toBe('PLATING Fish')
  })
})

describe('vessel library writes (1563)', () => {
  it('lets only an admin save or delete, and hands back the replaced image key', async () => {
    const someone = await createUser(db)
    const other = { ...vessel, id: randomUUID(), imageKey: `dishware/${randomUUID()}-fedcba9876543210.webp` }
    await expect(saveDishware({ db: serviceSupabase(), store: r2.store }, someone, other)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await saveDishware({ db: serviceSupabase(), store: r2.store }, admin, other)
    const replaced = `dishware/${other.id}-1111111111111111.webp`
    r2.upload(other.imageKey, Uint8Array.of(1), 'image/webp')
    await saveDishware({ db: serviceSupabase(), store: r2.store }, admin, { ...other, imageKey: replaced, isActive: false })
    expect(await r2.store.head(other.imageKey)).toBeNull()
    expect((await listDishware(serviceSupabase())).find((row) => row.id === other.id)).toMatchObject({ imageKey: replaced, isActive: false })
    await expect(saveDishware({ db: serviceSupabase(), store: r2.store }, admin, { ...other, category: 'dessert' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await deleteDishware({ db: serviceSupabase(), store: r2.store }, admin, other.id)
    await expect(deleteDishware({ db: serviceSupabase(), store: r2.store }, admin, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('keeps the table away from browsers', async () => {
    const { rows } = await db.query("select has_table_privilege('authenticated', 'public.dishware_library', 'select') as can")
    expect(rows[0]).toEqual({ can: false })
  })
})
