import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { viewWork } from '@/core/admin'
import { accountPrefixes } from '@/core/auth/account-deletion'
import { confirmJob, deleteWorkFiles, findOwnJob, GenerationFailure, keptInputsOf, reserveJob, runGeneration, type GenerationRequest } from '@/core/jobs'
import { inputPreviewKeyFor, isOwnInputKey, newInputKey } from '@/core/storage'
import { loadAgain, type CatalogueTemplate } from '@/modules/image'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, jobRow, seedTemplate, type FakeBehaviour } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T40 / ARCHITECTURE §8.3「输入图随作品保留」: settling a generation copies its upload next to the
// result and confirm_job records the key on the job in the same call; Make again copies it back to a fresh upload, long after
// inputs/ has expired. Copy failures never touch the settled, charged job.

let db: Client
let templateId: string
const service = serviceSupabase()
const DAY = 24 * 60 * 60 * 1000

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

async function setup(behaviour: FakeBehaviour = 'ok') {
  const userId = await createUser(db, { credits: 5 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1600, 1200), 'image/jpeg')
  const fake = fakeProvider(behaviour)
  const deps = { db: service, store: r2.store, provider: fake.provider, providerTimeoutMs: 200 }
  const request: GenerationRequest = {
    userId,
    source: 'web',
    templateId,
    inputKey,
    copy: { dish: 'ramen' },
    aspectRatio: '4:5',
    resolution: '2k',
    note: 'keep the chain gold',
  }
  return { userId, r2, deps, request, inputKey }
}

const keptKeyOf = async (userId: string, jobId: string) => keptInputsOf((await findOwnJob(service, userId, jobId))!)

const template = (): CatalogueTemplate =>
  ({ id: templateId, name: 'T4 test', creditsCost: { '1k': 1, '2k': 2, '4k': 3 }, copyFields: [{ key: 'dish', label: 'Dish', required: false, maxLength: 60 }] }) as CatalogueTemplate

describe('inputs kept at settle', () => {
  it('copies the upload next to the result and records it on the job', async () => {
    const { userId, r2, deps, request, inputKey } = await setup()
    const view = await runGeneration(deps, request)
    const kept = `outputs/${userId}/${view.id}-in-1.jpg`
    expect(await keptKeyOf(userId, view.id)).toEqual([kept])
    expect(r2.objects.get(kept)?.body).toEqual(r2.objects.get(inputKey)?.body)
    // Account deletion sweeps outputs/{user}/, so the copy goes with the account.
    expect(accountPrefixes(userId).some((prefix) => kept.startsWith(prefix))).toBe(true)
  })

  it('keeps the job succeeded and charged once when the copy fails, with nothing recorded', async () => {
    const { userId, r2, deps, request } = await setup()
    r2.failCopy.next = true
    const view = await runGeneration(deps, request)
    expect(view.status).toBe('succeeded')
    expect(await jobRow(db, view.id)).toMatchObject({ status: 'succeeded' })
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect(await keptKeyOf(userId, view.id)).toEqual([])
  })

  it('copies nothing for a failed, refunded job', async () => {
    const { r2, deps, request } = await setup('fail')
    expect(await runGeneration(deps, request).catch((e: unknown) => e)).toBeInstanceOf(GenerationFailure)
    expect([...r2.objects.keys()].some((key) => /-in-\d+\./.test(key))).toBe(false)
  })
})

describe('confirm_job kept inputs', () => {
  it('records the keys in the same call, drops keys outside the job’s slot, and keeps the first settlement', async () => {
    const userId = await createUser(db, { credits: 5 })
    const stranger = await createUser(db)
    const jobId = randomUUID()
    await reserveJob(service, { jobId, userId, module: 'image', templateId, source: 'web', inputs: { resolution: '1k' } })
    const own = `outputs/${userId}/${jobId}-in-1.jpg`
    const outputKey = `outputs/${userId}/${jobId}.png`
    const keptInputs = [`outputs/${stranger}/${jobId}-in-1.jpg`, own, `outputs/${userId}/${randomUUID()}-in-1.jpg`, `inputs/${userId}/${jobId}-in-1.jpg`]
    const job = await confirmJob(service, { jobId, outputKey, keptInputs })
    expect(keptInputsOf(job)).toEqual([own])
    const repeat = await confirmJob(service, { jobId, outputKey, keptInputs: [`outputs/${userId}/${jobId}-in-2.jpg`] })
    expect(keptInputsOf(repeat)).toEqual([own])
  })

  it('leaves inputs alone when nothing was kept', async () => {
    const userId = await createUser(db, { credits: 5 })
    const jobId = randomUUID()
    await reserveJob(service, { jobId, userId, module: 'image', templateId, source: 'web', inputs: { resolution: '1k' } })
    const job = await confirmJob(service, { jobId, outputKey: `outputs/${userId}/${jobId}.png`, keptInputs: [`outputs/${userId}/x-in-1.jpg`] })
    expect(job.inputs).not.toHaveProperty('kept_inputs')
  })
})

describe('Make again', () => {
  it('a week later still opens with the photo: a fresh upload that generates as usual', async () => {
    const { userId, r2, deps, request, inputKey } = await setup()
    const first = await runGeneration(deps, request)
    r2.objects.delete(inputKey) // the 7-day lifecycle
    const again = await loadAgain({ db: service, store: () => r2.store }, { userId, jobId: first.id, template: template() })
    expect(again).toMatchObject({ jobId: first.id, missing: null, values: { aspect: '4:5', resolution: '2k', note: 'keep the chain gold', copy: { dish: 'ramen' } } })
    const [photo] = again!.photos
    expect(isOwnInputKey(userId, photo!.inputKey)).toBe(true)
    expect(photo!.url).toBe(`memory://get/${photo!.inputKey}?expires=3600`)
    const second = await runGeneration(deps, { ...request, inputKey: photo!.inputKey })
    expect(second.status).toBe('succeeded')
    expect(await keptKeyOf(userId, second.id)).toEqual([`outputs/${userId}/${second.id}-in-1.jpg`])
  })

  it('asks for the photo again for old works and failed copies, and ignores other people’s and other templates’ works', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    const load = (who: string, tpl = template()) => loadAgain({ db: service, store: () => r2.store }, { userId: who, jobId: view.id, template: tpl })

    r2.failCopy.next = true
    expect(await load(userId)).toMatchObject({ photos: [], missing: 'failed' })

    // A work settled before T40: no kept_inputs on the job.
    await db.query(`update public.generation_jobs set inputs = inputs - 'kept_inputs' where id = $1`, [view.id])
    expect(await load(userId)).toMatchObject({ photos: [], missing: 'old', values: { resolution: '2k' } })

    expect(await load(await createUser(db))).toBeNull()
    expect(await load(userId, { ...template(), id: 'another-template' })).toBeNull()
    expect(await loadAgain({ db: service, store: () => r2.store }, { userId, jobId: undefined, template: template() })).toBeNull()
  })
})

describe('deleting a work', () => {
  it('removes the result, the preview and the kept upload', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    const job = (await findOwnJob(service, userId, view.id))!
    const files = [job.outputKey!, inputPreviewKeyFor(userId, view.id), `outputs/${userId}/${view.id}-in-1.jpg`]
    expect(files.every((key) => r2.objects.has(key))).toBe(true)
    await deleteWorkFiles(r2.store, job)
    expect(files.some((key) => r2.objects.has(key))).toBe(false)
  })
})

describe('admin view work', () => {
  it('links the kept copy, never expired, for a work made with T40', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    const later = new Date(Date.now() + 30 * DAY)
    const links = await viewWork({ db: service, store: r2.store, now: later }, view.id)
    expect(links).toMatchObject({ input: `memory://get/outputs/${userId}/${view.id}-in-1.jpg?expires=300`, inputExpired: false })
  })
})
