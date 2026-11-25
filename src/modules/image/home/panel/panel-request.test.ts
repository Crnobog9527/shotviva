import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../../catalogue/catalogue-template'
import type { HomeCatalogue } from '../home-catalogue'
import { browsePath, parseSetRef, readPanelQuery, withoutPanelQuery } from './panel-request'
import { panelReturnPath, resolvePanel } from './panel-resolve'

const template = (id: string, extra: Partial<CatalogueTemplate> = {}) => ({ id, name: `${id} name`, fields: {}, ...extra }) as unknown as CatalogueTemplate
const slot = template('poster', { hasDeferredSlots: true })

const series = (id: string, slug: string, memberIds: string[]) => ({
  type: 'series' as const, path: ['food'], series: { id, slug, name: `Series ${slug}`, description: null, cover: null, categoryName: 'Food', memberIds },
})

const catalogue: HomeCatalogue = {
  templates: [template('steak'), template('cake'), template('soup'), template('bread'), template('tea'), slot],
  browse: {
    filters: [],
    entries: [series('s1', 'warm-kitchen', ['soup', 'bread', 'gone']), { type: 'template', id: 'tea', path: ['drinks'] }],
  },
}

describe('the template panel: what opened it', () => {
  it('reads a set from data-pick-set or the address, and nothing else', () => {
    expect(parseSetRef('bundle:bundle-123')).toEqual({ kind: 'bundle', id: 'bundle-123' })
    expect(parseSetRef('series:warm-kitchen')).toEqual({ kind: 'series', slug: 'warm-kitchen' })
    for (const bad of [null, '', 'bundle:', 'series:a:b', 'team:x', 'bundle:../x', 'series:<b>']) expect(parseSetRef(bad)).toBeNull()
  })

  it('opens on a bundle card with every live member in the strip, on the template the card showed', () => {
    const opened = resolvePanel({ templateId: 'cake', set: { kind: 'bundle', id: 'bundle-b1' } }, catalogue, { name: 'Weekend', memberIds: ['steak', 'gone', 'cake', 'poster', 'steak'] })
    expect(opened?.startId).toBe('cake')
    expect(opened?.set.kind).toBe('bundle')
    expect(opened?.set.name).toBe('Weekend')
    // Not live and slot templates are left out, repeats once.
    expect(opened?.set.members.map((member) => member.id)).toEqual(['steak', 'cake'])
    expect(opened?.ref).toEqual({ kind: 'bundle', id: 'bundle-b1' })
  })

  it('opens a series card on the member on show, with the series in the strip', () => {
    const opened = resolvePanel({ templateId: 'bread', set: { kind: 'series', slug: 'warm-kitchen' } }, catalogue, null)
    expect(opened?.startId).toBe('bread')
    expect(opened?.set.kind).toBe('series')
    expect(opened?.set.members.map((member) => member.id)).toEqual(['soup', 'bread'])
    expect(opened?.ref).toEqual({ kind: 'series', slug: 'warm-kitchen' })
  })

  it('gives a single template in a series its series, and one outside any series no strip', () => {
    expect(resolvePanel({ templateId: 'soup', set: null }, catalogue, null)?.set.kind).toBe('series')
    const lone = resolvePanel({ templateId: 'tea', set: null }, catalogue, null)
    expect(lone?.set.kind).toBeNull()
    expect(lone?.set.members.map((member) => member.id)).toEqual(['tea'])
    expect(lone?.ref).toBeNull()
  })

  it('does not trust a set the template is not in', () => {
    // A bundle that does not hold the template, and a series slug it is not a member of.
    expect(resolvePanel({ templateId: 'tea', set: { kind: 'bundle', id: 'bundle-b1' } }, catalogue, { name: 'W', memberIds: ['steak', 'cake'] })?.set.kind).toBeNull()
    expect(resolvePanel({ templateId: 'tea', set: { kind: 'series', slug: 'warm-kitchen' } }, catalogue, null)?.set.kind).toBeNull()
    // A bundle card no longer on the page: the template alone.
    expect(resolvePanel({ templateId: 'steak', set: { kind: 'bundle', id: 'bundle-old' } }, catalogue, null)?.set.kind).toBeNull()
  })

  it('opens nothing for a template that is not live or takes its images by slot', () => {
    expect(resolvePanel({ templateId: 'gone', set: null }, catalogue, null)).toBeNull()
    expect(resolvePanel({ templateId: 'poster', set: null }, catalogue, null)).toBeNull()
  })
})

describe('the template panel: back from sign-up', () => {
  it('sends sign-up back to this page with the template and its set', () => {
    expect(panelReturnPath('/zh', { templateId: 'cake', set: { kind: 'bundle', id: 'bundle-b1' } })).toBe('/zh?panel=cake&set=bundle%3Abundle-b1')
    expect(panelReturnPath('/ai-restaurant-menu', { templateId: 'soup', set: { kind: 'series', slug: 'warm-kitchen' } })).toBe('/ai-restaurant-menu?panel=soup&set=series%3Awarm-kitchen')
    expect(panelReturnPath('/', { templateId: 'tea', set: null })).toBe('/?panel=tea')
  })

  it('reopens from that address, ignoring malformed values, and clears it after', () => {
    expect(readPanelQuery('?panel=cake&set=bundle%3Abundle-b1')).toEqual({ templateId: 'cake', set: { kind: 'bundle', id: 'bundle-b1' } })
    expect(readPanelQuery('?panel=cake&set=nope')).toEqual({ templateId: 'cake', set: null })
    expect(readPanelQuery('?panel=%3Cscript%3E')).toBeNull()
    expect(readPanelQuery('?utm_source=x')).toBeNull()
    expect(withoutPanelQuery('?panel=cake&set=series%3Ax&utm_source=x')).toBe('?utm_source=x')
    expect(withoutPanelQuery('?panel=cake')).toBe('')
  })

  it('takes a browse chip\'s category path of up to three slugs, else All', () => {
    expect(browsePath('food-drink/western/mains')).toEqual(['food-drink', 'western', 'mains'])
    expect(browsePath('')).toEqual([])
    expect(browsePath('a/b/c/d')).toEqual([])
    expect(browsePath('food/<x>')).toEqual([])
  })
})
