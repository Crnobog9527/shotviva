import { describe, expect, it } from 'vitest'

import type { Job } from '@/core/jobs'

import { echoTranslate } from '../echo-translate'
import { doneWhen, tileMeta, toPhotoItem } from './photo-item'

const job: Job = {
  id: 'j1',
  userId: 'u',
  module: 'image',
  templateId: 'pure-white',
  parentJobId: null,
  inputs: { aspect_ratio: '16:9', resolution: '2k' },
  provider: 'openai',
  source: 'web',
  idempotencyKey: null,
  status: 'succeeded',
  creditPool: 'paid',
  visibility: 'private',
  creditsCost: 4,
  outputKey: 'outputs/u/j1.png',
  errorCode: null,
  createdAt: new Date('2026-11-05T09:00:00Z'),
  finishedAt: null,
  deletedAt: null,
}

describe('photo items', () => {
  it('reads size and resolution from the job inputs, with safe fallbacks', () => {
    const lookup = new Map([['pure-white', { name: 'Pure White', cover: 'https://a/after.webp' }]])
    expect(toPhotoItem(job, lookup, '/api/files/j1')).toMatchObject({ templateName: 'Pure White', aspect: '16:9', resolution: '2k', credits: 4 })
    const odd = toPhotoItem({ ...job, inputs: { aspect_ratio: '7:1' } }, new Map(), null, 'Photo')
    expect(odd).toMatchObject({ templateName: 'Photo', aspect: 'original', resolution: '1k' })
  })

  // ARCHITECTURE §8.3「作品小图」: a finished work is listed by its small copy, never its full file.
  it('points a finished work at its small copy, or at the signed URL the page already holds', () => {
    expect(toPhotoItem(job, new Map(), '/api/files/j1')).toMatchObject({ fileUrl: '/api/files/j1', thumbUrl: '/api/files/j1/thumb?size=tile' })
    expect(toPhotoItem(job, new Map(), '/api/files/j1', '', 'https://r2.example/signed').thumbUrl).toBe('https://r2.example/signed')
    expect(toPhotoItem({ ...job, status: 'running' }, new Map(), null).thumbUrl).toBeNull()
  })

  it('picks today, yesterday or the formatted day, by the day in the viewer\'s zone', () => {
    const t = echoTranslate()
    const at = job.createdAt.toISOString() // 09:00 UTC on the 5th
    const day = (_: Date, sameYear: boolean) => (sameYear ? 'Nov 5' : 'Nov 5, 2026')
    expect(doneWhen(at, new Date('2026-11-05T20:00:00Z'), 'UTC', t, day)).toBe('photos.today')
    expect(doneWhen(at, new Date('2026-11-06T01:00:00Z'), 'UTC', t, day)).toBe('photos.yesterday')
    expect(doneWhen(at, new Date('2026-11-09T01:00:00Z'), 'UTC', t, day)).toBe('Nov 5')
    expect(doneWhen(at, new Date('2027-01-02T01:00:00Z'), 'UTC', t, day)).toBe('Nov 5, 2026')
    // 17:00 UTC on the 5th is already the 6th in Shanghai: a photo from 09:00 UTC was yesterday.
    expect(doneWhen(at, new Date('2026-11-05T17:00:00Z'), 'Asia/Shanghai', t, day)).toBe('photos.yesterday')
  })

  it('writes a tile\'s settings line', () => {
    const t = echoTranslate()
    const item = { aspect: '16:9' as const, resolution: '2k' as const, credits: 4 }
    expect(tileMeta(item, t)).toMatch(/^photos.tileMeta \{"size":/)
  })
})
