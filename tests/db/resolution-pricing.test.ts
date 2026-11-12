import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAdminTemplates, saveTemplate } from '@/core/admin'
import { reserveJob, runGeneration, type GenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'
import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createPricedTemplate, createUser, ledgerOf, profileOf, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// T16 (ARCHITECTURE §4–§6.1, AGENTS §7 item 3): the charge is templates.credits_cost at the
// chosen resolution, looked up in the database; an unknown resolution is refused before any
// credit moves; the admin cannot price below the floor.

const service = serviceClient()
let db: Client
let medium: string

beforeAll(async () => {
  db = await connectAdmin()
  medium = await createPricedTemplate(db, { '1k': 1, '2k': 2, '3k': 3 }, 'medium')
})

afterAll(async () => {
  await db.query("delete from public.templates where id like 'test-t16-%'")
  await db.end()
})

const reserve = (userId: string, templateId: string, inputs: Record<string, unknown>) =>
  reserveJob(service, { jobId: randomUUID(), userId, module: 'image', templateId, source: 'web', inputs })

describe('reserve_credits by resolution', () => {
  it('charges the template price for each tier: freeform (high) 2 / 4 / 6, medium 1 / 2 / 3', async () => {
    const userId = await createUser(db, { credits: 30 })
    const charged = []
    for (const resolution of ['1k', '2k', '3k']) {
      charged.push((await reserve(userId, 'freeform', { resolution })).creditsCost)
      charged.push((await reserve(userId, medium, { resolution })).creditsCost)
    }
    expect(charged).toEqual([2, 1, 4, 2, 6, 3])
    expect((await profileOf(db, userId)).credits).toBe(30 - 18)
  })

  it("throws on '8k' and charges nothing", async () => {
    const userId = await createUser(db, { credits: 10 })
    await expect(reserve(userId, medium, { resolution: '8k' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await profileOf(db, userId)).credits).toBe(10)
    expect(await ledgerOf(db, userId)).toEqual([])
  })

  it('ignores whatever cost the caller passes', async () => {
    const userId = await createUser(db, { credits: 12 })
    for (const cost of [99, 1, null]) {
      await db.query(
        "select public.reserve_credits(gen_random_uuid(), $1, 'image', 'freeform', $2, 'web', $3::jsonb)",
        [userId, cost, JSON.stringify({ resolution: '2k' })],
      )
    }
    expect((await ledgerOf(db, userId)).map((row) => row.delta)).toEqual([-4, -4, -4])
  })

  it("treats a missing resolution as '1k' and records it on the job", async () => {
    const userId = await createUser(db, { credits: 5 })
    const job = await reserve(userId, medium, { copy: {} })
    expect(job).toMatchObject({ creditsCost: 1, inputs: { resolution: '1k' } })
  })

  it('rejects a malformed price object or half-set motion cover at the table', async () => {
    const bad = ['{"1k": 1, "2k": 2}', '{"1k": 1, "2k": 2, "3k": 3, "4k": 4}', '{"1k": "1", "2k": 2, "3k": 3}', '{"1k": 0, "2k": 2, "3k": 3}']
    for (const cost of bad) {
      await expect(db.query('update public.templates set credits_cost = $2::jsonb where id = $1', [medium, cost])).rejects.toThrow(
        /templates_credits_cost_check/,
      )
    }
    await expect(db.query("update public.templates set cover_media_type = 'video' where id = $1", [medium])).rejects.toThrow(
      /templates_cover_motion_complete/,
    )
  })
})

describe('runGeneration by resolution', () => {
  async function setup() {
    const templateId = await seedTemplate(db)
    const userId = await createUser(db, { credits: 20 })
    const r2 = createMemoryStore()
    const inputKey = newInputKey(userId, 'image/jpeg')
    r2.upload(inputKey, await jpeg(2048, 1536), 'image/jpeg')
    const fake = fakeProvider()
    const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider }
    const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
      userId, source: 'web', templateId, inputKey, copy: { dish: 'ramen' }, ...overrides,
    })
    return { userId, fake, deps, request }
  }

  it('charges 1 / 2 / 3 for Standard / HD / Max and passes tier, quality and the photo size on', async () => {
    const { userId, fake, deps, request } = await setup()
    const views = []
    for (const resolution of ['1k', '2k', '4k'] as const) views.push(await runGeneration(deps, request({ resolution })))
    expect(views.map((view) => view.credits_cost)).toEqual([1, 2, 3])
    expect((await profileOf(db, userId)).credits).toBe(14)
    expect(fake.calls.map((call) => [call.resolution, call.quality, call.aspectRatio])).toEqual([
      ['1k', 'medium', 'original'],
      ['2k', 'medium', 'original'],
      ['3k', 'medium', 'original'],
    ])
    expect(fake.calls[0]?.images[0]).toMatchObject({ width: 2048, height: 1536 })
  })

  it('stores resolution and note in inputs and appends the note after the template prompt', async () => {
    const { fake, deps, request } = await setup()
    const view = await runGeneration(deps, request({ resolution: '2k', aspectRatio: '16:9', note: 'add a sprig of mint' }))
    const { rows } = await db.query<{ inputs: Record<string, unknown> }>('select inputs from public.generation_jobs where id = $1', [view.id])
    expect(rows[0]?.inputs).toMatchObject({ resolution: '2k', aspect_ratio: '16:9', note: 'add a sprig of mint' })
    expect(fake.calls[0]?.prompt).toBe('WRAPPED studio shot of ramen, keep the plate unchanged\n\nadd a sprig of mint')
  })

  it('refuses a size outside the eight before charging', async () => {
    const { userId, deps, request } = await setup()
    await expect(runGeneration(deps, request({ aspectRatio: '21:9' }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await profileOf(db, userId)).credits).toBe(20)
  })
})

describe('admin save checks the floor', () => {
  const id = `test-t16-${randomUUID().slice(0, 8)}`
  const payload = (creditsCost: Record<string, number>, quality = 'high', isNew = false) => ({
    isNew,
    template: {
      id, name: 'Floor test', category: 'pets', quality, creditsCost, visibleIn: ['web'],
      fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
    },
    prompt: { body: 'FAKE', modelParams: {} },
  })
  const client = serviceSupabase()

  it('refuses a high template at 1 credit for Standard, naming the floor 2; 3 saves', async () => {
    await saveTemplate(client, 'admin', payload({ '1k': 2, '2k': 4, '3k': 6 }, 'high', true), CREDITS_FLOOR)
    await expect(saveTemplate(client, 'admin', payload({ '1k': 1, '2k': 4, '3k': 6 }), CREDITS_FLOOR)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('Standard 不能低于 2'),
    })
    await saveTemplate(client, 'admin', payload({ '1k': 3, '2k': 4, '3k': 6 }), CREDITS_FLOOR)
    expect((await listAdminTemplates(client)).find((t) => t.id === id)).toMatchObject({
      quality: 'high',
      creditsCost: { '1k': 3, '2k': 4, '3k': 6 },
    })
  })

  it('lets a medium template go down to 1 / 2 / 3', async () => {
    await saveTemplate(client, 'admin', payload({ '1k': 1, '2k': 2, '3k': 3 }, 'medium'), CREDITS_FLOOR)
    expect((await listAdminTemplates(client)).find((t) => t.id === id)?.quality).toBe('medium')
  })
})
