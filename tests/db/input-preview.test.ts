import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GenerationFailure, hasInputPreview, resolveJobOriginal, runGeneration, type GenerationRequest } from '@/core/jobs'
import { inputPreviewKeyFor, newInputKey } from '@/core/storage'
import { accountPrefixes } from '@/core/auth/account-deletion'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, jobRow, seedTemplate, type FakeBehaviour } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T32 / ARCHITECTURE §8 「原图小图」: settling a generation keeps a 768px WebP of the upload
// next to the result, metadata-free; failing to write it never fails the job.

let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

async function setup(behaviour: FakeBehaviour = 'ok') {
  const userId = await createUser(db, { credits: 3 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  // A phone photo straight off the camera: EXIF and all (the browser-compression fallback).
  r2.upload(inputKey, await jpeg(2048, 1536, { exif: true }), 'image/jpeg')
  const fake = fakeProvider(behaviour)
  const deps = { db: serviceSupabase(), store: r2.store, provider: fake.provider, providerTimeoutMs: 200 }
  const request: GenerationRequest = { userId, source: 'web', templateId, inputKey, copy: { dish: 'ramen' }, aspectRatio: '4:5' }
  return { userId, r2, deps, request }
}

describe('input preview at settle', () => {
  it('writes a 768px WebP of the upload without EXIF next to the result', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    const entry = r2.objects.get(inputPreviewKeyFor(userId, view.id))
    expect(entry?.contentType).toBe('image/webp')
    const meta = await sharp(entry?.body).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 768, 576])
    expect(meta.exif).toBeUndefined()
    // Account deletion sweeps outputs/{user}/, so the preview goes with the result.
    expect(accountPrefixes(userId).some((prefix) => inputPreviewKeyFor(userId, view.id).startsWith(prefix))).toBe(true)
  })

  it('keeps the job succeeded and charged once when the preview cannot be written', async () => {
    const { userId, r2, deps, request } = await setup()
    const put = r2.store.put
    const store = {
      ...r2.store,
      put: (key: string, body: Uint8Array, type: string) => (key.endsWith('-input.webp') ? Promise.reject(new Error('r2 down')) : put(key, body, type)),
    }
    const view = await runGeneration({ ...deps, store }, request)
    expect(view.status).toBe('succeeded')
    expect(await jobRow(db, view.id)).toMatchObject({ status: 'succeeded' })
    expect((await profileOf(db, userId)).credits).toBe(2)
    expect(r2.objects.has(inputPreviewKeyFor(userId, view.id))).toBe(false)
  })

  it('writes nothing for a failed, refunded job', async () => {
    const { r2, deps, request } = await setup('fail')
    const error = await runGeneration(deps, request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GenerationFailure)
    expect([...r2.objects.keys()].some((key) => key.endsWith('-input.webp'))).toBe(false)
  })
})

describe('the photo page original', () => {
  it('signs the preview for its owner only; anyone else gets the same 404 as a missing job', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    const read = { db: deps.db, store: r2.store }
    expect(await resolveJobOriginal(read, { userId, jobId: view.id })).toBe(`memory://get/outputs/${userId}/${view.id}-input.webp?expires=300`)
    const stranger = await createUser(db, { credits: 1 })
    await expect(resolveJobOriginal(read, { userId: stranger, jobId: view.id })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    await expect(resolveJobOriginal(read, { userId, jobId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('reports a job without a preview (settled before T32) as deleted, and an R2 error the same way', async () => {
    const { userId, r2, deps, request } = await setup()
    const view = await runGeneration(deps, request)
    expect(await hasInputPreview(r2.store, { id: view.id, userId })).toBe(true)
    r2.objects.delete(inputPreviewKeyFor(userId, view.id))
    expect(await hasInputPreview(r2.store, { id: view.id, userId })).toBe(false)
    const broken = { ...r2.store, head: () => Promise.reject(new Error('r2 down')) }
    expect(await hasInputPreview(broken, { id: view.id, userId })).toBe(false)
  })
})
