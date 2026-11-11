import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import type { Job } from './job-schema'

const lookup = vi.hoisted(() => ({ job: null as Job | null }))
vi.mock('./job-lookup', () => ({ findOwnJob: async () => lookup.job }))

const { resolveJobFile, resolveJobPair } = await import('./job-file')

const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const OUTPUT = `outputs/${USER}/${JOB}.png`

function job(pool: 'free' | 'paid', background?: string): Job {
  return {
    id: JOB, userId: USER, module: 'image', templateId: 'main-image', parentJobId: null, batchId: null,
    inputs: background ? { background } : {}, provider: null, source: 'web', idempotencyKey: null,
    status: 'succeeded', creditPool: pool, visibility: pool === 'free' ? 'public' : 'private', creditsCost: 2,
    outputKey: OUTPUT, errorCode: null, createdAt: new Date(), finishedAt: new Date(), deletedAt: null,
  } as Job
}

async function setup(pool: 'free' | 'paid', background?: string) {
  const memory = createMemoryStore()
  const clear = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  memory.upload(OUTPUT, new Uint8Array(clear), 'image/png')
  lookup.job = job(pool, background)
  const get = vi.spyOn(memory.store, 'get')
  const resolve = (req: { download?: boolean; background?: 'white' | 'transparent' }) =>
    resolveJobFile({ db: {} as never, store: memory.store }, { userId: USER, jobId: JOB, download: req.download ?? true, ...req })
  return { memory, get, resolve }
}

const WHITE_KEY = `inputs/${USER}/downloads/${JOB}-white.jpg`
const MARKED_KEY = `inputs/${USER}/downloads/${JOB}-marked.png`

describe('download files for a cut-out (白底 / 透明底)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('paid 白底: stages a white JPEG once and redirects to it, named -white.jpg', async () => {
    const { memory, get, resolve } = await setup('paid', 'transparent')
    const first = await resolve({ background: 'white' })
    expect(first).toEqual({ kind: 'redirect', url: `memory://get/${WHITE_KEY}?expires=300&download=shotviva-${JOB}-white.jpg` })
    const staged = memory.objects.get(WHITE_KEY)
    expect(staged?.contentType).toBe('image/jpeg')
    expect(await sharp(staged?.body).metadata()).toMatchObject({ format: 'jpeg', width: 400, height: 300, hasAlpha: false })
    // A second download reuses the copy: no second read of the original.
    await resolve({ background: 'white' })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('paid 透明底: the stored original PNG, unchanged', async () => {
    const { memory, resolve } = await setup('paid', 'transparent')
    expect(await resolve({ background: 'transparent' })).toEqual({ kind: 'redirect', url: `memory://get/${OUTPUT}?expires=300&download=shotviva-${JOB}.png` })
    expect(memory.objects.size).toBe(1)
  })

  it('free 白底: the marked JPEG on white, as before, named -white.jpg', async () => {
    const { resolve } = await setup('free', 'transparent')
    const file = await resolve({ background: 'white' })
    expect(file).toMatchObject({ kind: 'bytes', contentType: 'image/jpeg', filename: `shotviva-${JOB}-white.jpg` })
  })

  it('free 透明底: the same mark on a PNG with alpha, staged and signed', async () => {
    const { memory, resolve } = await setup('free', 'transparent')
    const file = await resolve({ background: 'transparent' })
    expect(file).toEqual({ kind: 'redirect', url: `memory://get/${MARKED_KEY}?expires=300&download=shotviva-${JOB}.png` })
    expect(await sharp(memory.objects.get(MARKED_KEY)?.body).metadata()).toMatchObject({ format: 'png', hasAlpha: true })
  })

  it('ignores the choice for a work known to be opaque, and changes nothing without one', async () => {
    const opaque = await setup('paid', 'opaque')
    expect(await opaque.resolve({ background: 'white' })).toEqual({ kind: 'redirect', url: `memory://get/${OUTPUT}?expires=300&download=shotviva-${JOB}.png` })
    const plain = await setup('free', 'transparent')
    expect(await plain.resolve({ download: false })).toMatchObject({ kind: 'bytes', filename: `shotviva-${JOB}.jpg` })
    expect(plain.memory.objects.size).toBe(1)
  })

  it('honours the choice when the record is unknown (the browser found the transparency)', async () => {
    const { memory, resolve } = await setup('paid')
    await resolve({ background: 'white', download: false })
    expect(memory.objects.has(WHITE_KEY)).toBe(true)
  })
})

describe('白底 + 透明 pair ZIP', () => {
  const MARKED_WHITE_KEY = `inputs/${USER}/downloads/${JOB}-marked-white.jpg`
  const BOTH_KEY = `inputs/${USER}/downloads/${JOB}-both.zip`

  async function pair(pool: 'free' | 'paid', background?: string) {
    const { memory } = await setup(pool, background)
    const zip = vi.fn(async (archive: { key: string }) => `signed://${archive.key}`)
    const file = await resolveJobPair({ db: {} as never, store: memory.store, zip }, { userId: USER, jobId: JOB })
    return { memory, zip, file }
  }

  it('paid: the clean white JPEG and the original PNG, one ZIP per work', async () => {
    const { memory, zip, file } = await pair('paid', 'transparent')
    expect(file).toEqual({ kind: 'redirect', url: `signed://${BOTH_KEY}` })
    expect(zip).toHaveBeenCalledWith({
      key: BOTH_KEY,
      name: `shotviva-${JOB}.zip`,
      files: [
        { key: WHITE_KEY, name: `shotviva-${JOB}-white.jpg` },
        { key: OUTPUT, name: `shotviva-${JOB}.png` },
      ],
    })
    expect(await sharp(memory.objects.get(WHITE_KEY)?.body).metadata()).toMatchObject({ format: 'jpeg', hasAlpha: false })
  })

  it('free: both files carry the mark (white JPEG and alpha PNG), never the clean original', async () => {
    const { memory, zip } = await pair('free', 'transparent')
    const files = zip.mock.calls[0]?.[0] as unknown as { files: { key: string }[] }
    expect(files.files.map((f) => f.key)).toEqual([MARKED_WHITE_KEY, MARKED_KEY])
    expect(await sharp(memory.objects.get(MARKED_WHITE_KEY)?.body).metadata()).toMatchObject({ format: 'jpeg', hasAlpha: false })
    expect(await sharp(memory.objects.get(MARKED_KEY)?.body).metadata()).toMatchObject({ format: 'png', hasAlpha: true })
  })

  it('has no pair for a work known to be opaque', async () => {
    await expect(pair('paid', 'opaque')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('works for an unknown record (a paid cut-out the browser found)', async () => {
    const { file } = await pair('paid')
    expect(file).toEqual({ kind: 'redirect', url: `signed://${BOTH_KEY}` })
  })
})
