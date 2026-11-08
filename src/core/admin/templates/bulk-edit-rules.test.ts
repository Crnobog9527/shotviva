import { describe, expect, it } from 'vitest'

import { bulkEditFailures, describeFailure, describePatch, isBulkEditable, isEmptyPatch, type BulkEditCandidate } from './bulk-edit-rules'

const FLOOR = { high: { '1k': 2, '2k': 4, '3k': 6 }, medium: { '1k': 1, '2k': 2, '3k': 3 } }

const template = (id: string, over: Partial<BulkEditCandidate> = {}): BulkEditCandidate => ({
  id,
  name: id.toUpperCase(),
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
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
    const failures = bulkEditFailures([template('a'), template('b', { creditsCost: { '1k': 3, '2k': 4, '3k': 6 } })], { creditsCost: { '1k': 1 } }, FLOOR)
    expect(failures).toEqual([
      { id: 'a', name: 'A', reason: 'below_floor', resolution: '1k', floor: 2, given: 1 },
      { id: 'b', name: 'B', reason: 'below_floor', resolution: '1k', floor: 2, given: 1 },
    ])
    expect(describeFailure(failures[0]!)).toBe('Standard 1 低于下限 2（差 1）')
  })

  it('checks against the new quality: medium lowers the floor, high raises it', () => {
    const cheap = template('a', { quality: 'medium', creditsCost: { '1k': 1, '2k': 2, '3k': 3 } })
    expect(bulkEditFailures([cheap], { creditsCost: { '2k': 2 }, quality: 'medium' }, FLOOR)).toEqual([])
    expect(bulkEditFailures([template('b')], { creditsCost: { '2k': 2 }, quality: 'medium' }, FLOOR)).toEqual([])
    const raised = bulkEditFailures([cheap], { quality: 'high' }, FLOOR).map((f) => f.reason === 'below_floor' && f.resolution)
    expect(raised).toEqual(['1k', '2k', '3k'])
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
      '积分：HD → 5',
      '展示入口 → 站内 + 伙伴',
      '出图质量 → medium',
    ])
  })
})
