import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { FREE_MAX_EDGE } from '../storage'
import type { Job } from './job-schema'

// Owner 2026-11-22: no clean copy of a free work (free or channel-partner promo credits) may leave
// the server. Every server path that hands out a work's pixels is driven here for a free work, and
// none may sign the stored original or return its bytes; each copy it does hand out is capped at
// 1080 px. A paid work keeps its clean original, exactly as before.

const lookup = vi.hoisted(() => ({ job: null as Job | null }))
vi.mock('./job-lookup', () => ({ findOwnJob: async () => lookup.job }))

const { resolveJobFile, resolveJobPair } = await import('./job-file')
const { firstThumbUrls, resolveJobThumb } = await import('./job-thumb')
const { partnerImageUrl } = await import('../partner/partner-views')
const { servedWorkImage } = await import('../gallery/image')

const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '44444444-4444-4444-8444-444444444444'
const OUTPUT = `outputs/${USER}/${JOB}.png`

function job(pool: 'free' | 'paid'): Job {
  return {
    id: JOB, userId: USER, module: 'image', templateId: 'main-image', parentJobId: null, batchId: null,
    inputs: { background: 'transparent' }, provider: null, source: 'web', idempotencyKey: null,
    status: 'succeeded', creditPool: pool, visibility: 'public', creditsCost: 2,
    outputKey: OUTPUT, errorCode: null, createdAt: new Date(), finishedAt: new Date(), deletedAt: null,
  } as Job
}

const keyOf = (url: string) => url.replace(/^memory:\/\/get\//, '').replace(/^signed:\/\//, '').split('?')[0]!

// Every link and body every path gives for this work, plus the files the ZIP would pack.
async function everything(pool: 'free' | 'paid') {
  const memory = createMemoryStore()
  memory.upload(OUTPUT, await png(2048, 2560), 'image/png')
  lookup.job = job(pool)
  const deps = { db: {} as never, store: memory.store }
  const signed: string[] = []
  const bodies: Uint8Array[] = []
  for (const download of [true, false]) {
    for (const background of [undefined, 'white', 'transparent'] as const) {
      const file = await resolveJobFile(deps, { userId: USER, jobId: JOB, download, ...(background ? { background } : {}) })
      if (file.kind === 'redirect') signed.push(keyOf(file.url))
      else bodies.push(file.body)
    }
  }
  const zipped: string[] = []
  await resolveJobPair({ ...deps, zip: async (archive) => (zipped.push(...archive.files.map((f) => f.key)), `signed://${archive.key}`) }, { userId: USER, jobId: JOB })
  signed.push(keyOf(await resolveJobThumb(deps, { userId: USER, jobId: JOB })))
  signed.push(...[...(await firstThumbUrls(() => memory.store, [lookup.job])).values()].map(keyOf))
  signed.push(keyOf((await partnerImageUrl(memory.store, lookup.job))!))
  const shown = await servedWorkImage({ store: memory.store, defer: () => undefined }, { id: JOB, outputKey: OUTPUT, creditPool: pool }, 960)
  bodies.push(shown!)
  const original = Buffer.from(memory.objects.get(OUTPUT)!.body)
  return { memory, signed, zipped, bodies, original }
}

describe('no clean free path', { timeout: 60_000 }, () => {
  it('never signs, packs or returns a free work’s original, and caps every copy at 1080 px', async () => {
    const { memory, signed, zipped, bodies, original } = await everything('free')
    expect(signed.length).toBeGreaterThan(0)
    expect(signed).not.toContain(OUTPUT)
    expect(zipped).not.toContain(OUTPUT)
    for (const key of [...signed, ...zipped]) {
      const body = memory.objects.get(key)!.body
      expect(Buffer.from(body).equals(original), key).toBe(false)
      const { width = 0, height = 0 } = await sharp(body).metadata()
      expect(Math.max(width, height), key).toBeLessThanOrEqual(FREE_MAX_EDGE)
    }
    for (const body of bodies) {
      expect(Buffer.from(body).equals(original)).toBe(false)
      const { width = 0, height = 0 } = await sharp(body).metadata()
      expect(Math.max(width, height)).toBeLessThanOrEqual(FREE_MAX_EDGE)
    }
  })

  it('leaves a paid work exactly as before: its clean original, full size', async () => {
    const { signed, zipped, bodies } = await everything('paid')
    expect(signed).toContain(OUTPUT)
    expect(zipped).toContain(OUTPUT)
    expect(signed.some((key) => key.includes('-p1'))).toBe(false)
    // The gallery's copy of a paid work is a clean resize, not capped at 1080.
    expect(await sharp(bodies.at(-1)!).metadata()).toMatchObject({ width: 960, height: 1200 })
  })
})
