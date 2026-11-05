import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '@/core/analytics'

import { GenerationFailure, runGeneration, type GenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, jobRow, seedTemplate, type FakeBehaviour } from './generation-fixtures'
import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf, type TestProfile } from './helpers'
import { serviceSupabase } from './supabase-env'

// AGENTS §7 item 3: success, failure and timeout all settle correctly; failure always refunds.
// Real local Supabase (reserve/confirm/refund SQL), fake R2 and fake OpenAI.

let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

async function setup(behaviour: FakeBehaviour = 'ok', profile: TestProfile = { credits: 3 }) {
  const userId = await createUser(db, profile)
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(2048, 1536), 'image/jpeg')
  const fake = fakeProvider(behaviour)
  const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 200 }
  const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
    userId,
    source: 'web',
    templateId,
    inputKey,
    copy: { dish: 'tonkotsu ramen' },
    aspectRatio: '4:5',
    ...overrides,
  })
  return { userId, r2, inputKey, fake, deps, request }
}

describe('runGeneration: success', () => {
  it('charges 1, stores outputs/{user}/{job}.png and answers without image bytes', async () => {
    const { userId, r2, fake, deps, request } = await setup()
    const view = await runGeneration(deps, request())

    expect(view).toMatchObject({
      status: 'succeeded',
      credits_cost: 1,
      credit_pool: 'paid',
      visibility: 'private',
      file_url: `/api/files/${view.id}`,
    })
    expect(JSON.stringify(view).length).toBeLessThan(1000)
    expect(r2.objects.has(`outputs/${userId}/${view.id}.png`)).toBe(true)
    expect((await jobRow(db, view.id))?.output_key).toBe(`outputs/${userId}/${view.id}.png`)
    expect((await profileOf(db, userId)).credits).toBe(2)

    const [call] = fake.calls
    expect(call?.prompt).toBe('WRAPPED studio shot of tonkotsu ramen, keep the plate unchanged')
    expect(call?.images[0]?.contentType).toBe('image/jpeg')
    expect(call?.aspectRatio).toBe('4:5')
  })

  it('makes a public free work from free credits, whatever the membership says', async () => {
    const { deps, request } = await setup('ok', { freeCredits: 1, paidUntil: new Date(Date.now() + DAY_MS) })
    expect(await runGeneration(deps, request({ visibility: 'private' }))).toMatchObject({
      credit_pool: 'free',
      visibility: 'public',
    })
  })

  it('runs the provider once for repeated or concurrent requests with one job id', async () => {
    const { userId, fake, deps, request } = await setup()
    const jobId = randomUUID()
    const views = await Promise.all([1, 2, 3].map(() => runGeneration(deps, request({ jobId }))))
    expect(new Set(views.map((v) => v.id))).toEqual(new Set([jobId]))
    expect(fake.generate).toHaveBeenCalledTimes(1)
    expect((await runGeneration(deps, request({ jobId }))).status).toBe('succeeded')
    expect((await profileOf(db, userId)).credits).toBe(2)
  })
})

describe('runGeneration: failures refund', () => {
  it.each([
    ['provider error', 'fail', 'GENERATION_FAILED', 'PROVIDER_FAILED'],
    ['safety refusal', 'reject', 'CONTENT_REJECTED', 'CONTENT_REJECTED'],
    ['provider timeout', 'hang', 'GENERATION_FAILED', 'PROVIDER_TIMEOUT'],
  ] as const)('%s → refunded, job failed', async (_, behaviour, code, jobCode) => {
    const { userId, r2, deps, request } = await setup(behaviour)
    const error = await runGeneration(deps, request()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GenerationFailure)
    const failure = error as GenerationFailure
    expect(failure).toMatchObject({ code, refunded: true, jobCode })
    expect(await jobRow(db, failure.jobId)).toMatchObject({ status: 'failed', error_code: jobCode, output_key: null })
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect((await ledgerOf(db, userId)).map((row) => row.kind)).toEqual(['reserve', 'refund'])
    expect([...r2.objects.keys()].some((key) => key.startsWith('outputs/'))).toBe(false)
  })

  it('refunds when the output cannot be written', async () => {
    const { userId, r2, deps, request } = await setup()
    r2.failPut.next = true
    const error = (await runGeneration(deps, request()).catch((e: unknown) => e)) as GenerationFailure
    expect(await jobRow(db, error.jobId)).toMatchObject({ status: 'failed', error_code: 'OUTPUT_WRITE_FAILED' })
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('does not call the provider when credits are short', async () => {
    const { fake, deps, request } = await setup('ok', { credits: 0 })
    await expect(runGeneration(deps, request())).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT', status: 402 })
    expect(fake.generate).not.toHaveBeenCalled()
  })
})

describe('runGeneration: guards', () => {
  it('hides partner-only templates from the web', async () => {
    const { deps, request } = await setup()
    await expect(runGeneration(deps, request({ templateId: 'freeform', inputKey: null }))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses another user’s upload without deleting it', async () => {
    const { r2, deps, request } = await setup()
    const other = await setup()
    r2.upload(other.inputKey, await jpeg(10, 10), 'image/jpeg')
    await expect(runGeneration(deps, request({ inputKey: other.inputKey }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(r2.objects.has(other.inputKey)).toBe(true)
  })

  it('rate-limits an account with jobs already in flight', async () => {
    const { userId, deps, request } = await setup('ok', { credits: 5 })
    for (let i = 0; i < 2; i += 1) {
      await db.query(
        `insert into public.generation_jobs (id, user_id, module, template_id, source, credit_pool, visibility, credits_cost)
         values ($1, $2, 'image', $3, 'web', 'free', 'public', 1)`,
        [randomUUID(), userId, templateId],
      )
    }
    await expect(runGeneration(deps, request())).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
    expect((await profileOf(db, userId)).credits).toBe(5)
  })
})

// T18: one `generate` event per settled job (ARCHITECTURE §16.2), success or failure, and
// never for a replay. Nothing in it may carry the user's copy or the prompt.
describe('runGeneration: generate event', () => {
  it('reports a success with the dictionary properties only', async () => {
    const { userId, deps, request } = await setup()
    const track = vi.fn<ServerTrack>()
    const jobId = randomUUID()
    await runGeneration({ ...deps, track }, request({ jobId }))
    await runGeneration({ ...deps, track }, request({ jobId }))

    expect(track).toHaveBeenCalledOnce()
    const [event, props, ctx] = track.mock.calls[0] ?? []
    expect(event).toBe('generate')
    expect(ctx).toEqual({ distinctId: userId })
    expect(props).toMatchObject({
      template_id: templateId,
      category: 'test',
      resolution: '1k',
      credits_cost: 1,
      credit_pool: 'paid',
      status: 'succeeded',
      error_code: null,
      source: 'web',
    })
    expect(JSON.stringify(props)).not.toMatch(/ramen|WRAPPED|inputs\//)
  })

  it('reports a timeout as failed with the stored error code', async () => {
    const { deps, request } = await setup('hang')
    const track = vi.fn<ServerTrack>()
    await expect(runGeneration({ ...deps, track }, request())).rejects.toBeInstanceOf(GenerationFailure)
    expect(track).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({ status: 'failed', error_code: 'PROVIDER_TIMEOUT' }),
      expect.anything(),
    )
  })

  it('sends nothing when the request is refused before credits are reserved', async () => {
    const { deps, request } = await setup('ok', { credits: 0 })
    const track = vi.fn<ServerTrack>()
    await expect(runGeneration({ ...deps, track }, request())).rejects.toThrow()
    expect(track).not.toHaveBeenCalled()
  })
})
