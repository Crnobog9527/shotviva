import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { againValues, makeAgainHref } from './again-start'

const template = {
  id: 'pure-white',
  creditsCost: { '1k': 2, '2k': 4 },
  copyFields: [{ key: 'headline', label: 'Headline', required: true, maxLength: 5 }],
} as unknown as CatalogueTemplate

describe('againValues', () => {
  it('reads back the old work’s size, resolution, note and text', () => {
    const inputs = { aspect_ratio: '4:5', resolution: '2k', note: 'keep the chain gold', copy: { headline: 'Sale!!!', other: 'x' }, kept_inputs: ['k'] }
    expect(againValues(inputs, template)).toEqual({ aspect: '4:5', resolution: '2k', note: 'keep the chain gold', copy: { headline: 'Sale!' } })
  })

  it('falls back to the defaults for what the template no longer offers or was never set', () => {
    expect(againValues({ aspect_ratio: '7:3', resolution: '3k', note: 4, copy: 'no' }, template)).toEqual({
      aspect: 'original',
      resolution: '1k',
      note: '',
      copy: {},
    })
  })
})

describe('makeAgainHref', () => {
  it('opens the template workspace from the work, as the photo page and the Photos grid both link it', () => {
    expect(makeAgainHref('pure-white', '5c0d9a8e-1111-4222-8333-444455556666')).toBe('/generate/pure-white?again=5c0d9a8e-1111-4222-8333-444455556666')
    expect(makeAgainHref('a b', 'x&y')).toBe('/generate/a%20b?again=x%26y')
  })
})
