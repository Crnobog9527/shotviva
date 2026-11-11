import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { png, text } from '../../../tests/fakes/images'
import { createMemoryStore } from '../../../tests/fakes/memory-store'
import type { ObjectStore } from '../storage'
import type { Job } from './job-schema'

const mocks = vi.hoisted(() => ({ findOwnJob: vi.fn() }))
// findOwnJob is the owner check itself (a stranger's job reads as missing); its query runs
// against the real database in tests/db/job-thumb.test.ts.
vi.mock('./job-lookup', () => ({ findOwnJob: mocks.findOwnJob }))

const { firstThumbUrls, resolveJobThumb } = await import('./job-thumb')

const db = {} as SupabaseClient
const job = { id: 'j1', userId: 'u1', status: 'succeeded', creditPool: 'paid', outputKey: 'outputs/u1/j1.png' } as Job
const THUMB = 'outputs/u1/j1-thumb.webp'
const SIGNED = `memory://get/${THUMB}?expires=300`
const req = { userId: 'u1', jobId: 'j1' }

// ARCHITECTURE §8.3「作品小图」: the thumbnail route's rules.
describe('resolveJobThumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOwnJob.mockResolvedValue(job)
  })

  it('answers 404 for a job that is not the caller’s, not finished, or has no output', async () => {
    const r2 = createMemoryStore()
    for (const found of [null, { ...job, status: 'running' }, { ...job, status: 'failed' }, { ...job, outputKey: null }]) {
      mocks.findOwnJob.mockResolvedValue(found)
      await expect(resolveJobThumb({ db, store: r2.store }, req)).rejects.toMatchObject({ status: 404 })
    }
    expect(mocks.findOwnJob).toHaveBeenCalledWith(db, 'u1', 'j1')
    expect(r2.objects.size).toBe(0)
  })

  it('signs the stored small copy for five minutes, without reading the full file', async () => {
    const r2 = createMemoryStore()
    r2.upload(THUMB, text('thumb'), 'image/webp')
    const get = vi.spyOn(r2.store, 'get')
    expect(await resolveJobThumb({ db, store: r2.store }, req)).toBe(SIGNED)
    expect(get).not.toHaveBeenCalled()
  })

  it('makes the small copy of an older work on first view, clean for a paid work', async () => {
    const r2 = createMemoryStore()
    r2.upload(job.outputKey!, await png(1024, 1280), 'image/png')
    expect(await resolveJobThumb({ db, store: r2.store }, req)).toBe(SIGNED)
    expect(await sharp(r2.objects.get(THUMB)?.body).metadata()).toMatchObject({ format: 'webp', width: 480, height: 600 })
  })

  it('marks the copy it makes for a free work, like the full file', async () => {
    const [free, paid] = [createMemoryStore(), createMemoryStore()]
    const bytes = await png(1024, 1024)
    free.upload(job.outputKey!, bytes, 'image/png')
    paid.upload(job.outputKey!, bytes, 'image/png')
    await resolveJobThumb({ db, store: paid.store }, req)
    mocks.findOwnJob.mockResolvedValue({ ...job, creditPool: 'free' })
    await resolveJobThumb({ db, store: free.store }, req)
    expect(Buffer.from(free.objects.get(THUMB)!.body).equals(Buffer.from(paid.objects.get(THUMB)!.body))).toBe(false)
  })

  it('falls back to the full-file route when no copy exists and none can be made', async () => {
    const gone = createMemoryStore()
    expect(await resolveJobThumb({ db, store: gone.store }, req)).toBe('/api/files/j1')

    const unreadable = createMemoryStore()
    unreadable.upload(job.outputKey!, text('not an image'), 'image/png')
    expect(await resolveJobThumb({ db, store: unreadable.store }, req)).toBe('/api/files/j1')

    const down = createMemoryStore()
    down.upload(job.outputKey!, await png(600, 600), 'image/png')
    down.failPut.next = true
    expect(await resolveJobThumb({ db, store: down.store }, req)).toBe('/api/files/j1')
  })

  it('treats an R2 error on the existence check as missing, not as a failure', async () => {
    const r2 = createMemoryStore()
    r2.upload(job.outputKey!, await png(600, 600), 'image/png')
    vi.spyOn(r2.store, 'head').mockRejectedValue(new Error('R2 down'))
    expect(await resolveJobThumb({ db, store: r2.store }, req)).toBe(SIGNED)
  })
})

describe('firstThumbUrls', () => {
  const jobs = ['a', 'b', 'c'].map((id) => ({ id, userId: 'u1' }))

  it('signs only the works that already have a small copy, and only the first few', async () => {
    const r2 = createMemoryStore()
    for (const id of ['a', 'c']) r2.upload(`outputs/u1/${id}-thumb.webp`, text('thumb'), 'image/webp')
    const get = vi.spyOn(r2.store, 'get')
    const signed = await firstThumbUrls(() => r2.store, jobs)
    expect([...signed]).toEqual([
      ['a', 'memory://get/outputs/u1/a-thumb.webp?expires=300'],
      ['c', 'memory://get/outputs/u1/c-thumb.webp?expires=300'],
    ])
    // Nothing is made here: a missing copy is the thumbnail route's job.
    expect(get).not.toHaveBeenCalled()
    expect([...(await firstThumbUrls(() => r2.store, jobs, 1)).keys()]).toEqual(['a'])
  })

  it('answers nothing, never throws, when R2 is not configured or fails', async () => {
    const unset = (): ObjectStore => {
      throw new Error('R2 storage is not configured')
    }
    expect((await firstThumbUrls(unset, jobs)).size).toBe(0)
    const r2 = createMemoryStore()
    vi.spyOn(r2.store, 'head').mockRejectedValue(new Error('R2 down'))
    expect((await firstThumbUrls(() => r2.store, jobs)).size).toBe(0)
  })
})
