import { describe, expect, it } from 'vitest'

import { batchHref, batchSearch, parseTemplateIds } from './batch-query'

describe('Batch create in the address (?batch=1&t=)', () => {
  it('opens on templates and keeps every other parameter', () => {
    expect(batchSearch(new URLSearchParams('category=food'), ['a', 'b'])).toBe('?category=food&batch=1&t=a,b')
    expect(batchSearch(new URLSearchParams('category=food&batch=1&t=x'), [])).toBe('?category=food&batch=1')
  })

  it('closes without leaving batch or t behind', () => {
    expect(batchSearch(new URLSearchParams('series=s&batch=1&t=a'), null)).toBe('?series=s')
    expect(batchSearch(new URLSearchParams('batch=1'), null)).toBe('')
  })

  it('links from another page to Create with the dialog open', () => {
    expect(batchHref(['tpl-1'])).toBe('/generate?batch=1&t=tpl-1')
    expect(batchHref()).toBe('/generate?batch=1')
  })

  it('reads template ids once each, at most five', () => {
    expect(parseTemplateIds('a,b,,a,c,d,e,f')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(parseTemplateIds(null)).toEqual([])
  })
})
