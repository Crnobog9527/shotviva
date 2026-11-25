import { describe, expect, it } from 'vitest'

import type { PublicCaseEntry } from '@/core/templates/home-case-strip'

import { caseStripItems, homeCaseStrip } from './home-case-strip'

const template = (id: string, covers = true) => ({
  id, name: `Name ${id}`, description: covers ? `use ${id}` : null,
  coverBeforeUrl: covers ? `https://assets.test/${id}-before.webp` : null, coverAfterUrl: covers ? `https://assets.test/${id}-after.webp` : null,
})
const live = [template('a'), template('b'), template('c'), template('bare', false)]
const one = (id: string): PublicCaseEntry => ({ kind: 'template', id })
const set = (id: string, memberIds: string[]): PublicCaseEntry => ({ kind: 'bundle', id, name: `Set ${id}`, memberIds })
const builtIn = { heading: 'More real dishes', items: [{ before: { src: '/home/x.webp', alt: 'x', width: 1, height: 1 }, after: { src: '/home/y.webp', alt: 'y', width: 1, height: 1 }, caption: 'Built in' }] }

describe('首页「更多真实案例」', () => {
  it('pairs each template\'s own covers, names it and picks it', () => {
    const [item] = caseStripItems([one('a')], live, 'en')
    expect(item).toMatchObject({
      caption: 'Name a', pick: 'a',
      before: { src: 'https://assets.test/a-before.webp', alt: 'Real phone photo for the Name a template' },
      after: { src: 'https://assets.test/a-after.webp', alt: 'Real example made with the Name a template: use a' },
    })
    expect(item.set).toBeUndefined()
  })

  it('writes the alt text in the page\'s language', () => {
    expect(caseStripItems([one('a')], live, 'zh')[0].before.alt).toBe('「Name a」模板的真实手机照')
  })

  it('shows a bundle as its first live template with covers, under the bundle\'s name', () => {
    const [item] = caseStripItems([set('s', ['gone', 'bare', 'b', 'c'])], live, 'en')
    expect(item).toMatchObject({ caption: 'Set s', pick: 'b', set: { count: 3, showing: 'Name b' }, before: { src: 'https://assets.test/b-before.webp' } })
  })

  it('drops what is not live: a template without covers, one taken down, a bundle with fewer than two live templates', () => {
    expect(caseStripItems([one('bare'), one('gone'), set('s', ['a', 'gone']), one('c')], live, 'en').map((item) => item.pick)).toEqual(['c'])
  })

  it('keeps the order and never more than eight', () => {
    const many = Array.from({ length: 10 }, (_, index) => template(`t${index}`))
    expect(caseStripItems(many.map((item) => one(item.id)), many, 'en').map((item) => item.pick)).toEqual(many.slice(0, 8).map((item) => item.id))
  })

  it('keeps the built-in row when nothing is set or nothing set is live, under the same heading otherwise', () => {
    expect(homeCaseStrip(builtIn, [], live, 'en')).toEqual(builtIn)
    expect(homeCaseStrip(builtIn, [one('gone')], live, 'en')).toEqual(builtIn)
    expect(homeCaseStrip(builtIn, [one('a')], live, 'en')).toMatchObject({ heading: 'More real dishes', items: [{ pick: 'a' }] })
  })

  it('shows no row on a hero option without one', () => {
    expect(homeCaseStrip(undefined, [one('a')], live, 'en')).toBeUndefined()
  })
})
