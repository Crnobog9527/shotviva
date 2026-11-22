import { describe, expect, it, vi } from 'vitest'

import { png } from '../../../../tests/fakes/images'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { applyWatermark } from '../../storage'
import { stageTrace, traceUpload } from './trace'

const JOB = '5d6e7f80-91a2-4b3c-8d4e-5f6071829304'
const OWNER = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'
const UPLOAD = '6c1f6c0e-0f6a-4b8e-9f3d-2a7f4c1e9b20'

// generation_jobs read by primary-key range, and the owner's email from Auth.
function fakeDb() {
  const range = { from: '', to: '' }
  const query = {
    select: () => query,
    gte: (_: string, from: string) => ((range.from = from), query),
    lte: (_: string, to: string) => ((range.to = to), query),
    limit: async () => ({
      data: JOB >= range.from && JOB <= range.to
        ? [{ id: JOB, user_id: OWNER, credit_pool: 'free', template_id: 'main-image', status: 'succeeded', created_at: '2026-11-20T10:00:00Z', deleted_at: null }]
        : [],
      error: null,
    }),
  }
  const getUserById = vi.fn(async () => ({ data: { user: { email: 'owner@example.com' } }, error: null }))
  return { db: { from: () => query, auth: { admin: { getUserById } } } as never, range }
}

describe('水印追查', { timeout: 60_000 }, () => {
  it('stages only still images up to 20MB', async () => {
    const r2 = createMemoryStore()
    await expect(stageTrace(r2.store, { contentType: 'image/gif', size: 10 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(stageTrace(r2.store, { contentType: 'image/jpeg', size: 21 * 1024 * 1024 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await stageTrace(r2.store, { contentType: 'image/jpeg', size: 1000 })).putUrl).toContain('uploads-admin/trace/')
  })

  it('names the work and its owner from a free copy, then deletes the upload', async () => {
    const r2 = createMemoryStore()
    const key = `uploads-admin/trace/${UPLOAD}`
    r2.upload(key, await applyWatermark(await png(1200, 1500), { jobId: JOB }), 'image/jpeg')
    const { db, range } = fakeDb()
    const result = await traceUpload({ db, store: r2.store }, { uploadId: UPLOAD })
    expect(result).toMatchObject({ found: true, prefix: '5d6e7f8091a2', works: [{ jobId: JOB, userId: OWNER, ownerEmail: 'owner@example.com', creditPool: 'free', deleted: false }] })
    expect(range).toEqual({ from: '5d6e7f80-91a2-0000-0000-000000000000', to: '5d6e7f80-91a2-ffff-ffff-ffffffffffff' })
    expect(r2.objects.has(key)).toBe(false)
  })

  it('says nothing was found for an unmarked picture, and still deletes it', async () => {
    const r2 = createMemoryStore()
    const key = `uploads-admin/trace/${UPLOAD}`
    r2.upload(key, await png(800, 800), 'image/png')
    expect(await traceUpload({ db: fakeDb().db, store: r2.store }, { uploadId: UPLOAD })).toEqual({ found: false })
    expect(r2.objects.has(key)).toBe(false)
    await expect(traceUpload({ db: fakeDb().db, store: r2.store }, { uploadId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
