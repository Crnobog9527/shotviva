import { describe, expect, it } from 'vitest'

import { bulkEditFailures, describeFailure, describePatch, isBulkEditable, isEmptyPatch, type BulkEditCandidate } from './bulk-edit-rules'

const FLOOR = { high: { '1k': 2, '2k': 4, '4k': 6 }, medium: { '1k': 1, '2k': 2, '4k': 3 } }

const template = (id: string, over: Partial<BulkEditCandidate> = {}): BulkEditCandidate => ({
  id,
  name: id.toUpperCase(),
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
  visibleIn: ['web'],
  isActive: true,
  description: 'A template.',
  coverBeforeUrl: 'https://assets.test/b.webp',
  coverLocales: {},
  coverAfterUrl: 'https://assets.test/a.webp',
  ...over,
})

describe('batch edit floor check (T79)', () => {
  it('accepts a change that keeps every template at or above its floor', () => {
    expect(bulkEditFailures([template('a'), template('b')], { creditsCost: { '2k': 5 } }, FLOOR)).toEqual([])
  })

  it('lists every template and tier that would fall below the floor, with how much', () => {
    const failures = bulkEditFailures([template('a'), template('b', { creditsCost: { '1k': 3, '2k': 4, '4k': 6 } })], { creditsCost: { '1k': 1 } }, FLOOR)
    expect(failures).toEqual([
      { id: 'a', name: 'A', reason: 'below_floor', resolution: '1k', floor: 2, given: 1 },
      { id: 'b', name: 'B', reason: 'below_floor', resolution: '1k', floor: 2, given: 1 },
    ])
    expect(describeFailure(failures[0]!)).toBe('1K 1 低于下限 2（差 1）')
  })

  it('checks against the new quality: medium lowers the floor, high raises it', () => {
    const cheap = template('a', { quality: 'medium', creditsCost: { '1k': 1, '2k': 2, '4k': 3 } })
    expect(bulkEditFailures([cheap], { creditsCost: { '2k': 2 }, quality: 'medium' }, FLOOR)).toEqual([])
    expect(bulkEditFailures([template('b')], { creditsCost: { '2k': 2 }, quality: 'medium' }, FLOOR)).toEqual([])
    const raised = bulkEditFailures([cheap], { quality: 'high' }, FLOOR).map((f) => f.reason === 'below_floor' && f.resolution)
    expect(raised).toEqual(['1k', '2k', '4k'])
  })

  it('refuses putting a live template on the web without its description or covers', () => {
    const partnerOnly = template('p', { visibleIn: ['partner'], description: null })
    expect(bulkEditFailures([partnerOnly], { visibleIn: ['web', 'partner'] }, FLOOR)).toEqual([
      { id: 'p', name: 'P', reason: 'web_incomplete' },
    ])
    // Unpublished, or already on the web: not this rule's business.
    expect(bulkEditFailures([{ ...partnerOnly, isActive: false }], { visibleIn: ['web'] }, FLOOR)).toEqual([])
    expect(bulkEditFailures([template('w', { coverAfterUrl: null })], { visibleIn: ['web'] }, FLOOR)).toEqual([])
  })

  it('never batch-edits the built-in edit and freeform templates', () => {
    const failures = bulkEditFailures([template('freeform', { visibleIn: ['partner'] }), template('edit'), template('a')], { quality: 'high' }, FLOOR)
    expect(failures).toEqual([
      { id: 'freeform', name: 'FREEFORM', reason: 'system' },
      { id: 'edit', name: 'EDIT', reason: 'system' },
    ])
    expect(isBulkEditable({ id: 'freeform' })).toBe(false)
    expect(isBulkEditable({ id: 'a' })).toBe(true)
    // Any template T75 put in a system category, whatever its id.
    expect(isBulkEditable({ id: 'b', categoryInfo: { isSystem: true } })).toBe(false)
  })

  it('describes the change and knows an empty one', () => {
    expect(isEmptyPatch({})).toBe(true)
    expect(isEmptyPatch({ creditsCost: {} })).toBe(true)
    expect(isEmptyPatch({ categoryKey: 'pets' })).toBe(false)
    expect(describePatch({ categoryKey: 'pets' }, () => '宠物 · Pets')).toEqual(['分类 → 宠物 · Pets'])
    expect(describePatch({ creditsCost: { '2k': 5 }, visibleIn: ['web', 'partner'], quality: 'medium' })).toEqual([
      '积分：2K → 5',
      '展示入口 → 站内 + 伙伴',
      '出图质量 → medium',
    ])
  })
})

it('checks an art draft against its selected route when an admin changes Standard or HD', () => {
  const draft = template('style', { category: 'art-styles', isActive: false, prompt: { providerId: 'seed' } })
  const tiers = { '1k': 13, '2k': 17, '4k': 1 }
  const floor = { ...FLOOR, version: 'v2' as const, providers: { seed: { high: tiers, medium: tiers } } }
  expect(bulkEditFailures([draft], { creditsCost: { '1k': 21, '2k': 17 } }, floor)).toEqual([])
  expect(bulkEditFailures([draft], { creditsCost: { '1k': 21, '2k': 16 } }, floor)).toMatchObject([
    { id: 'style', reason: 'below_floor', resolution: '2k', floor: 17 },
  ])
})

it('checks each template against the replacement route before applying any batch edits', () => {
  const expensive = { '1k': 20, '2k': 40, '4k': 60 }
  const route = { ...FLOOR, providers: { seed: { high: expensive, medium: expensive } } }
  const ready = template('ready', { creditsCost: expensive })
  expect(bulkEditFailures([ready, template('cheap')], { providerId: 'seed' }, route))
    .toMatchObject(['1k','2k','4k'].map(resolution => ({ id: 'cheap', reason: 'below_floor', resolution })))
})

it('keeps unpriced tiers closed across other bulk changes and checks newly entered prices', () => {
  const row = template('new-route', { unpricedResolutions: ['4k'], creditsCost: { '1k': 5, '2k': 5, '4k': 1 } })
  expect(bulkEditFailures([row], { quality: 'high' }, FLOOR)).toEqual([])
  expect(bulkEditFailures([row], { creditsCost: { '4k': 2 } }, FLOOR)).toMatchObject([
    { resolution: '4k', given: 2, floor: 6 },
  ])
})

it('uses the previous route only for legacy rows without a saved tier decision', () => {
  const floors = { ...FLOOR, activeProvider: 'default', providers: {
    seed: { ...FLOOR, resolutions: ['1k', '2k'] as const }, default: FLOOR,
  } }
  const row = template('legacy', { prompt: { providerId: 'seed' }, creditsCost: { '1k': 10, '2k': 15, '4k': 1 } })
  expect(bulkEditFailures([row], { providerId: null }, floors)).toEqual([])
  expect(bulkEditFailures([{ ...row, unpricedResolutions: [] }], { providerId: null }, floors))
    .toMatchObject([{ resolution: '4k', given: 1 }])
})
