import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { handleGenerate, revokeLink, type FetchLike, type GenerateRequest } from '@/core/partner'

import { png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, jobCount, seedTemplate, type FakeBehaviour } from './generation-fixtures'
import { connectAdmin, profileOf } from './helpers'
import { linkedUser, partnerRequest, routeDeps } from './partner-fixtures'
import { serviceSupabase } from './supabase-env'

// AGENTS §7 item 7 + TASKS T7: one Idempotency-Key charges once, 402 carries top_up_url,
// revoked links 401, and a bad image URL is a 422 before any credit moves. Real local
// Supabase (the web's reserve/confirm/refund SQL), fake R2, fake OpenAI, fake fetch.

let db: Client
let photoTemplate: string
let webOnlyTemplate: string

beforeAll(async () => {
  db = await connectAdmin()
  photoTemplate = await seedTemplate(db, { visibleIn: ['web', 'partner'] })
  webOnlyTemplate = await seedTemplate(db, { visibleIn: ['web'] })
})

afterAll(async () => {
  await db.end()
})

const freeform: GenerateRequest = { template_id: 'freeform', inputs: { copy: { prompt: 'a bowl of ramen on slate' } } }

async function setup(behaviour: FakeBehaviour = 'ok', credits = 3) {
  const userId = await linkedUser(db, { credits })
  const r2 = createMemoryStore()
  const fake = fakeProvider(behaviour)
  const fetch = vi.fn<FetchLike>(async () => new Response((await png(3000, 1500)).slice()))
  const deps = { ...routeDeps(r2.store), provider: fake.provider, providerTimeoutMs: 200, fetch }
  const generate = (body: unknown, key: string | undefined = randomUUID()) =>
    handleGenerate(partnerRequest('/api/partner/generate', { method: 'POST', account: userId, idempotencyKey: key, body }), deps)
  return { userId, r2, fake, fetch, generate }
}

describe('POST /api/partner/generate: success', () => {
  it('generates freeform through the web credit path with source graylum and a 7-day URL', async () => {
    const { userId, generate } = await setup()
    const response = await generate(freeform, 'call-1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: 'succeeded', credits_charged: 1, credits_remaining: 2, free_credits_remaining: 0 })
    expect(body.image_url).toBe(`memory://get/outputs/${userId}/${body.job_id}.png?expires=604800`)
    const { rows } = await db.query('select source, idempotency_key, status from public.generation_jobs where id = $1', [body.job_id])
    expect(rows[0]).toEqual({ source: 'graylum', idempotency_key: 'call-1', status: 'succeeded' })
  })

  it('fetches the image URL, downsizes it and feeds it to the model', async () => {
    const { fake, fetch, generate } = await setup()
    const body = { template_id: photoTemplate, inputs: { copy: { dish: 'salmon' } }, image: 'https://img.graylum.com/u/1.png' }
    expect((await generate(body)).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fake.calls[0]?.images[0]?.contentType).toBe('image/jpeg')
  })
})

describe('POST /api/partner/generate: Idempotency-Key', () => {
  it('replays return the same job and charge once', async () => {
    const { userId, fake, generate } = await setup()
    const first = await (await generate(freeform, 'call-x')).json()
    const again = await (await generate(freeform, 'call-x')).json()
    expect(again.job_id).toBe(first.job_id)
    expect(fake.generate).toHaveBeenCalledTimes(1)
    expect((await profileOf(db, userId)).credits).toBe(2)
    expect(await jobCount(db, userId)).toBe(1)
  })

  it('concurrent requests with one key make one job and one charge', async () => {
    const { userId, fake, generate } = await setup()
    const responses = await Promise.all([1, 2, 3].map(() => generate(freeform, 'call-race')))
    const bodies = await Promise.all(responses.map((r) => r.json()))
    expect(new Set(bodies.map((b) => b.job_id)).size).toBe(1)
    expect(responses.map((r) => r.status).sort()).toContain(200)
    expect(fake.generate).toHaveBeenCalledTimes(1)
    expect((await profileOf(db, userId)).credits).toBe(2)
  })

  it('is required', async () => {
    const { userId, generate } = await setup()
    expect((await generate(freeform, '')).status).toBe(422)
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('replaying a refused job answers the same refusal without charging or calling the model', async () => {
    const { userId, fake, generate } = await setup('reject')
    const first = await generate(freeform, 'call-r')
    expect(first.status).toBe(422)
    const body = await first.json()
    expect(body).toMatchObject({ code: 'content_rejected', refunded: true })
    const again = await generate(freeform, 'call-r')
    expect(await again.json()).toMatchObject({ code: 'content_rejected', job_id: body.job_id })
    expect(fake.generate).toHaveBeenCalledTimes(1)
    expect((await profileOf(db, userId)).credits).toBe(3)
  })
})

describe('POST /api/partner/generate: errors', () => {
  it('402 quota_exhausted with top_up_url (and the given return_to) when out of credits', async () => {
    const { userId, generate } = await setup('ok', 0)
    const response = await generate({ ...freeform, return_to: 'https://graylum.com/chat/42' })
    expect(response.status).toBe(402)
    const body = await response.json()
    expect(body.code).toBe('quota_exhausted')
    expect(new URL(body.top_up_url).searchParams.get('return_to')).toBe('https://graylum.com/chat/42')
    expect(await jobCount(db, userId)).toBe(0)
  })

  it('500 generation_failed is refunded', async () => {
    const { userId, generate } = await setup('fail')
    const response = await generate(freeform)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'generation_failed', refunded: true })
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('401 link_revoked after Disconnect', async () => {
    const { userId, generate } = await setup()
    await revokeLink(serviceSupabase(), userId)
    const response = await generate(freeform)
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe('link_revoked')
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('404s a web-only template, 422s missing fields and a bad return_to, all uncharged', async () => {
    const { userId, generate } = await setup()
    expect((await generate({ template_id: webOnlyTemplate })).status).toBe(404)
    expect((await generate({ template_id: 'freeform' })).status).toBe(422)
    expect((await generate({ ...freeform, return_to: 'https://evil.example/' })).status).toBe(422)
    expect((await generate({ ...freeform, inputs: { copy: { prompt: 'x', extra: 'y' } } })).status).toBe(422)
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect(await jobCount(db, userId)).toBe(0)
  })
})

describe('POST /api/partner/generate: image URL (anti-SSRF), 422 without charging', () => {
  const withImage = (image: string) => ({ template_id: photoTemplate, inputs: { copy: { dish: 'x' } }, image })

  it.each([
    ['non-https', 'http://img.graylum.com/a.png'],
    ['outside the allowlist', 'https://evil.example/a.png'],
    ['internal address', 'https://169.254.169.254/latest/meta-data'],
  ])('%s is never fetched', async (_, image) => {
    const { userId, fetch, generate } = await setup()
    const response = await generate(withImage(image))
    expect(response.status).toBe(422)
    expect((await response.json()).code).toBe('invalid_input')
    expect(fetch).not.toHaveBeenCalled()
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('too big is refused', async () => {
    const { userId, fetch, generate } = await setup()
    fetch.mockImplementation(async () => new Response('x', { headers: { 'content-length': String(25 * 1024 * 1024) } }))
    expect((await generate(withImage('https://img.graylum.com/big.png'))).status).toBe(422)
    expect((await profileOf(db, userId)).credits).toBe(3)
    expect(await jobCount(db, userId)).toBe(0)
  })
})
