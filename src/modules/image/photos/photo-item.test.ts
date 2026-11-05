import { describe, expect, it } from 'vitest'

import type { Job } from '@/core/jobs'

import { echoTranslate } from '../echo-translate'
import { doneMeta, runningMeta, toPhotoItem } from './photo-item'

const job: Job = {
  id: 'j1',
  userId: 'u',
  module: 'image',
  templateId: 'pure-white',
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
}

describe('photo items', () => {
  it('reads size and resolution from the job inputs, with safe fallbacks', () => {
    const lookup = new Map([['pure-white', { name: 'Pure White', cover: 'https://a/after.webp' }]])
    expect(toPhotoItem(job, lookup, '/api/files/j1')).toMatchObject({ templateName: 'Pure White', aspect: '16:9', resolution: '2k', credits: 4 })
    const odd = toPhotoItem({ ...job, inputs: { aspect_ratio: '7:1' } }, new Map(), null, 'Photo')
    expect(odd).toMatchObject({ templateName: 'Photo', aspect: 'original', resolution: '1k' })
  })

  it('picks today, yesterday or the formatted day', () => {
    const t = echoTranslate()
    const item = { createdAt: job.createdAt.toISOString(), aspect: '16:9' as const, resolution: '2k' as const, credits: 4 }
    const day = () => 'Nov 5'
    expect(doneMeta(item, new Date('2026-11-05T20:00:00Z'), t, day)).toBe('photos.today · sizes.16:9 16:9 · tiers.2k.name')
    expect(doneMeta(item, new Date('2026-11-06T01:00:00Z'), t, day)).toMatch(/^photos.yesterday/)
    expect(doneMeta(item, new Date('2026-11-09T01:00:00Z'), t, day)).toMatch(/^Nov 5 · /)
    expect(runningMeta({ ...item, aspect: '1:1' }, t)).toBe('1:1 · tiers.2k.name · credits {"count":4}')
  })
})
