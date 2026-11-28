import { describe, expect, it } from 'vitest'

import type { Job } from '@/core/jobs'
import type { CompanyPhoto } from '@/core/org/works'

import { toCompanyItems } from './company-items'

const ME = '11111111-1111-4111-8111-111111111111'
const PEER = '22222222-2222-4222-8222-222222222222'
const row = (id: string, userId: string | null, extra: Partial<CompanyPhoto> = {}): CompanyPhoto => ({
  id, userId, orgWork: true, archived: false, templateId: 'pure-white', templateName: 'Pure White',
  createdAt: '2026-11-28T06:00:00.123456+00:00', aspectRatio: '4:5', memberActive: true, ...extra,
})
const job = (id: string): Job => ({
  id, userId: ME, module: 'image', templateId: 'pure-white', parentJobId: null, inputs: { aspect_ratio: '1:1', resolution: '2k' },
  provider: 'openai', source: 'web', idempotencyKey: null, status: 'succeeded', creditPool: 'paid', visibility: 'private',
  creditsCost: 4, outputKey: `outputs/${ME}/${id}.png`, errorCode: null, createdAt: new Date('2026-11-28T06:00:00Z'), finishedAt: null, deletedAt: null,
})
const deps = (own: Job[]) => ({
  me: ME, own: new Map(own.map((j) => [j.id, j])), templates: new Map(), labels: new Map([[PEER, 'peer@example.com']]),
  fallbackName: 'Photo', fileUrlFor: (id: string) => `/api/files/${id}`,
})

// ARCHITECTURE §6.5「作品页就是企业作品」: what each row of the company view becomes on the grid.
describe('toCompanyItems', () => {
  it('builds the reader\'s own works from their full rows, and marks the personal ones', () => {
    const items = toCompanyItems([row('a', ME), row('b', ME, { orgWork: false })], deps([job('a'), job('b')]))
    expect(items.map((i) => [i.id, i.personal, i.maker, i.fileUrl])).toEqual([['a', false, undefined, '/api/files/a'], ['b', true, undefined, '/api/files/b']])
    expect(items[0]).toMatchObject({ aspect: '1:1', resolution: '2k', thumbUrl: '/api/files/a/thumb?size=tile' })
  })

  it('makes a colleague\'s work a reduced item served by the org route, never the reader\'s own', () => {
    const [item] = toCompanyItems([row('c', PEER)], deps([]))
    expect(item).toMatchObject({
      id: 'c', templateName: 'Pure White', aspect: '4:5', visibility: 'private', batchId: null,
      fileUrl: '/api/account/enterprise/works/c', thumbUrl: '/api/account/enterprise/works/c?size=thumb',
      maker: { who: 'peer@example.com', state: 'active' },
    })
    expect(item?.createdAt).toBe('2026-11-28T06:00:00.123Z')
  })

  it('says when the maker has left or deleted their account', () => {
    const items = toCompanyItems([row('d', PEER, { memberActive: false }), row('e', null, { archived: true, memberActive: false })], deps([]))
    expect(items.map((i) => i.maker)).toEqual([{ who: 'peer@example.com', state: 'removed' }, { who: null, state: 'deleted' }])
  })

  it('drops an own row whose job is gone between the two reads', () => {
    expect(toCompanyItems([row('gone', ME)], deps([]))).toEqual([])
  })
})
