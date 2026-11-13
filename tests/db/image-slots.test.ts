import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { viewWork } from '@/core/admin'
import { applyPurchase } from '@/core/billing'
import { deleteWorkFiles, findOwnJob, keptInputsOf, runGeneration, type GenerationRequest } from '@/core/jobs'
import { inputPreviewKeyFor, newInputKey } from '@/core/storage'
import { loadAgain, type CatalogueTemplate } from '@/modules/image'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// Named image slots (ARCHITECTURE §5.1e): one job takes up to four labelled uploads, sent in the
// slot order with the prompt told which is which; required slots are refused before any charge;
// the kept copies go back to their own slots on Make again, even when one copy failed.

let db: Client
let templateId: string
const service = serviceSupabase()

const SLOTS = [
  { key: 'logo', label: 'Venue logo', required: false },
  { key: 'prize_1', label: '1st prize photo', required: true, note: 'prize_1_note' },
  { key: 'prize_2', label: '2nd prize photo', required: false },
]

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db, {
    images: { min: 1, max: 3, slots: SLOTS },
    copy: [{ key: 'venue', label: 'Venue name', required: true, maxLength: 16 }, { key: 'prize_1_note', label: '1st prize details', maxLength: 60 }],
    body: 'WRAPPED prize poster. {{image_slots}}',
  })
})

afterAll(async () => {
  await db.end()
})

async function setup(slots: readonly string[] = ['logo', 'prize_1', 'prize_2']) {
  const userId = await createUser(db, { credits: 5 })
  const r2 = createMemoryStore()
  const uploads: Record<string, string> = {}
  for (const [index, slot] of slots.entries()) {
    uploads[slot] = newInputKey(userId, 'image/jpeg')
    r2.upload(uploads[slot], await jpeg(800 + index * 100, 800), 'image/jpeg')
  }
  const fake = fakeProvider()
  const deps = { db: service, store: r2.store, provider: fake.provider, providerTimeoutMs: 200 }
  const request: GenerationRequest = {
    userId, source: 'web', templateId, inputSlots: uploads, copy: { venue: 'Night Flight', prize_1_note: 'amber whisky' }, aspectRatio: '1:1', resolution: '1k',
  }
  return { userId, r2, deps, request, uploads, fake }
}

const template = (): CatalogueTemplate => ({
  id: templateId, name: 'Slots', creditsCost: { '1k': 1, '2k': 2, '3k': 3 }, photoInput: 'required', toggles: [],
  copyFields: [{ key: 'venue', label: 'Venue name', type: 'short', required: true, maxLength: 16, public: false }],
  imageSlots: SLOTS.map(({ key, label, required }) => ({ key, label, required })),
}) as unknown as CatalogueTemplate

describe('a slot template job', () => {
  it('sends the filled slots in slot order with their list, keeps each upload, writes no input preview', async () => {
    const { userId, r2, deps, request, uploads, fake } = await setup(['prize_2', 'logo', 'prize_1'])
    const view = await runGeneration(deps, { ...request, inputSlots: { prize_2: uploads.prize_2!, prize_1: uploads.prize_1! } })
    expect(view.status).toBe('succeeded')
    const [call] = fake.calls
    expect(call!.images.map((image) => image.width)).toEqual([1000, 800])
    expect(call!.prompt).toContain('Image 1: 1st prize photo; Image 2: 2nd prize photo')
    const job = (await findOwnJob(service, userId, view.id))!
    expect(job.inputs.input_key).toBeNull()
    expect((job.inputs.input_slots as { key: string }[]).map((slot) => slot.key)).toEqual(['prize_1', 'prize_2'])
    expect(keptInputsOf(job)).toEqual([`outputs/${userId}/${view.id}-in-1.jpg`, `outputs/${userId}/${view.id}-in-2.jpg`])
    expect(r2.objects.has(inputPreviewKeyFor(userId, view.id))).toBe(false)
    expect((await profileOf(db, userId)).credits).toBe(4)
  })

  it.each([
    ['a missing required slot', { inputSlots: { logo: 'x' } }],
    ['the single upload', { inputKey: 'x' }],
    ['the partner route', { source: 'graylum' as const }],
  ])('refuses %s before any charge', async (_, patch) => {
    const { userId, deps, request, uploads } = await setup()
    const fill = (value: unknown) => (value === 'x' ? uploads.logo : value)
    const changed = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, typeof value === 'object' && value ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)])) : fill(value)]))
    await expect(runGeneration(deps, { ...request, ...changed })).rejects.toMatchObject({ code: expect.stringMatching(/INVALID_INPUT|TEMPLATE_UNAVAILABLE|NOT_FOUND/) })
    expect((await profileOf(db, userId)).credits).toBe(5)
  })

  it('refuses a batch even for a Max account (single run only)', async () => {
    const { userId, deps, request } = await setup()
    await applyPurchase(serviceClient(), { userId, productId: 'max_monthly', eventId: randomUUID() })
    const before = (await profileOf(db, userId)).credits
    await expect(runGeneration(deps, { ...request, batchSize: 2 })).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'This template makes one image at a time' })
    expect((await profileOf(db, userId)).credits).toBe(before)
  })

  it('refuses someone else’s upload in a slot', async () => {
    const { deps, request } = await setup()
    const stranger = await createUser(db)
    await expect(runGeneration(deps, { ...request, inputSlots: { prize_1: newInputKey(stranger, 'image/jpeg') } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('Make again, delete and admin view of a slot work', () => {
  it('puts each kept photo back in its own slot, even after one copy failed', async () => {
    const { userId, r2, deps, request } = await setup()
    r2.failCopy.next = true // the logo's copy fails at settle; the prizes keep -in-2 / -in-3
    const view = await runGeneration(deps, request)
    const again = await loadAgain({ db: service, store: () => r2.store }, { userId, jobId: view.id, template: template() })
    expect(again?.missing).toBeNull()
    expect(again?.photos.map((photo) => photo.slot)).toEqual(['prize_1', 'prize_2'])
  })

  it('deletes every kept slot copy with the work, and the admin view says how many there were', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    const links = await viewWork({ db: service, store: r2.store }, view.id)
    expect(links).toMatchObject({ slotCount: 3, input: `memory://get/outputs/${userId}/${view.id}-in-1.jpg?expires=300` })
    const job = (await findOwnJob(service, userId, view.id))!
    const kept = keptInputsOf(job)
    expect(kept).toHaveLength(3)
    await deleteWorkFiles(r2.store, job)
    expect(kept.some((key) => r2.objects.has(key))).toBe(false)
  })
})

describe('slot order survives jsonb (keys jsonb would re-sort)', () => {
  it('puts the logo back in the logo slot when its key sorts after the prize key', async () => {
    // jsonb orders object keys shorter-first: an object { venue_logo, prize_1 } reads back as
    // { prize_1, venue_logo }. The order is stored as an array, so Make again maps -in-1 to the logo.
    const id = await seedTemplate(db, {
      images: { min: 0, max: 2, slots: [{ key: 'venue_logo', label: 'Venue logo', required: false }, { key: 'prize_1', label: '1st prize photo', required: false }] },
      copy: [], body: 'WRAPPED poster {{image_slots}}',
    })
    const userId = await createUser(db, { credits: 5 })
    const r2 = createMemoryStore()
    const logo = newInputKey(userId, 'image/jpeg')
    const prize = newInputKey(userId, 'image/jpeg')
    r2.upload(logo, await jpeg(700, 700), 'image/jpeg')
    r2.upload(prize, await jpeg(900, 600), 'image/jpeg')
    const fake = fakeProvider()
    const deps = { db: service, store: r2.store, provider: fake.provider, providerTimeoutMs: 200 }
    const view = await runGeneration(deps, { userId, source: 'web', templateId: id, inputSlots: { prize_1: prize, venue_logo: logo }, copy: {}, aspectRatio: '1:1', resolution: '1k' })
    expect(fake.calls[0]!.images.map((image) => image.width)).toEqual([700, 900])
    const tpl = { ...template(), id, imageSlots: [{ key: 'venue_logo', label: 'Venue logo', required: false }, { key: 'prize_1', label: '1st prize photo', required: false }] } as unknown as CatalogueTemplate
    const again = await loadAgain({ db: service, store: () => r2.store }, { userId, jobId: view.id, template: tpl })
    const bySlot = Object.fromEntries((again?.photos ?? []).map((photo) => [photo.slot, photo.bytes]))
    expect(bySlot.venue_logo).toBe(r2.objects.get(logo)!.body.length)
    expect(bySlot.prize_1).toBe(r2.objects.get(prize)!.body.length)
  })
})

describe('the database reference check counts slots (0943)', () => {
  it('refuses more slots than the model takes', async () => {
    const five = Array.from({ length: 4 }, (_, i) => ({ key: `s${i}`, label: `S${i}`, required: false }))
    const id = await seedTemplate(db, { images: { min: 0, max: 4, slots: five } })
    await expect(db.query(`update public.templates set fields = jsonb_set(fields, '{images,max}', '5') where id = $1`, [id])).rejects.toThrow(/MODEL_REFERENCE_LIMIT/)
  })
})
