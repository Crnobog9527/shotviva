import { describe, expect, it } from 'vitest'

import { createShareSchema, isWorkShareId, type WorkShare } from './share-schema'
import { shareViewOf } from './share-view'

const owner = '11111111-1111-4111-8111-111111111111'
const share: WorkShare = {
  id: 'a'.repeat(32),
  ownerId: owner,
  title: 'Menu',
  note: null,
  showBefore: true,
  createdAt: new Date('2026-11-22T00:00:00Z'),
  ref: 'chef-ann',
  items: [
    { jobId: '22222222-2222-4222-8222-222222222222', templateId: 'tpl', creditPool: 'free', outputKey: `outputs/${owner}/x.png`, aspectRatio: '4:5' },
    { jobId: '33333333-3333-4333-8333-333333333333', templateId: 'gone', creditPool: 'paid', outputKey: `outputs/${owner}/y.png`, aspectRatio: null },
  ],
}

describe('the public view of a link', () => {
  it('carries only route paths: no storage key and no owner id', () => {
    const view = shareViewOf(share, new Set([share.items[0]!.jobId]), (id) => (id === 'tpl' ? 'Plated dish' : 'Photo'))
    const text = JSON.stringify(view)
    expect(text).not.toContain('outputs/')
    expect(text).not.toContain(owner)
    expect(view.works.map((work) => [work.afterUrl, work.beforeUrl, work.watermarked, work.templateName])).toEqual([
      [`/api/s/w/${share.id}/${share.items[0]!.jobId}/after`, `/api/s/w/${share.id}/${share.items[0]!.jobId}/before`, true, 'Plated dish'],
      [`/api/s/w/${share.id}/${share.items[1]!.jobId}/after`, null, false, 'Photo'],
    ])
  })

  it('has no before at all when the sharer did not opt in', () => {
    const view = shareViewOf({ ...share, showBefore: false }, new Set(), () => 'Photo')
    expect(view.works.every((work) => work.beforeUrl === null)).toBe(true)
  })
})

describe('share requests', () => {
  const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
  it('take 1 to 30 distinct works, off by default for originals', () => {
    expect(createShareSchema.parse({ jobIds: [id(1)] })).toMatchObject({ showBefore: false })
    expect(createShareSchema.safeParse({ jobIds: [] }).success).toBe(false)
    expect(createShareSchema.safeParse({ jobIds: [id(1), id(1)] }).success).toBe(false)
    expect(createShareSchema.safeParse({ jobIds: Array.from({ length: 31 }, (_, n) => id(n)) }).success).toBe(false)
    expect(createShareSchema.safeParse({ jobIds: [id(1)], title: 'x'.repeat(81) }).success).toBe(false)
    expect(createShareSchema.parse({ jobIds: [id(1)], title: '  Menu  ' }).title).toBe('Menu')
  })

  it('recognise only a 32-hex link id', () => {
    expect(isWorkShareId('a'.repeat(32))).toBe(true)
    expect(isWorkShareId('A'.repeat(32))).toBe(false)
    expect(isWorkShareId('../etc')).toBe(false)
  })
})
