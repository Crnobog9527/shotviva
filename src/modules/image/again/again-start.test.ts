import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { againValues, makeAgainHref } from './again-start'

const template = {
  id: 'pure-white',
  creditsCost: { '1k': 2, '2k': 4 },
  copyFields: [{ key: 'headline', label: 'Headline', required: true, maxLength: 5 }],
  toggles: [{ key: 'replate', label: 'Upgrade plating', confirm: { title: 't', body: 'b', checkbox: 'c', accept: 'a' } }],
} as unknown as CatalogueTemplate

describe('againValues', () => {
  it('reads back the old work’s size, resolution, note and text', () => {
    const inputs = { aspect_ratio: '4:5', resolution: '2k', note: 'keep the chain gold', copy: { headline: 'Sale!!!', other: 'x' }, kept_inputs: ['k'] }
    expect(againValues(inputs, template)).toEqual({ aspect: '4:5', resolution: '2k', note: 'keep the chain gold', copy: { headline: 'Sale!' }, toggles: {} })
  })

  it('falls back to the defaults for what the template no longer offers or was never set', () => {
    expect(againValues({ aspect_ratio: '7:3', resolution: '4k', note: 4, copy: 'no' }, template)).toEqual({
      aspect: 'original',
      resolution: '1k',
      note: '',
      copy: {},
      toggles: {},
    })
  })

  it('keeps a confirmed toggle on without asking again, and drops ones the template lost (T89)', () => {
    const inputs = { toggles: { replate: true, steam: true }, toggles_confirmed_at: { replate: '2026-11-08T12:00:00Z' } }
    expect(againValues(inputs, template).toggles).toEqual({ replate: true })
    expect(againValues({ toggles: { replate: false } }, template).toggles).toEqual({})
  })

  it('reads a template without toggles as having none (T89)', () => {
    const plain = { ...template, toggles: undefined } as unknown as CatalogueTemplate
    expect(againValues({ toggles: { replate: true }, toggles_confirmed_at: { replate: 'x' } }, plain).toggles).toEqual({})
  })

  it('starts a toggle off when the work has no confirmation for today’s dialog (T89)', () => {
    // On before the toggle had a dialog: the user never saw it, so no confirm flag is sent for them.
    expect(againValues({ toggles: { replate: true } }, template).toggles).toEqual({})
    expect(againValues({ toggles: { replate: true }, toggles_confirmed_at: { replate: 1 } }, template).toggles).toEqual({})
  })
})

describe('makeAgainHref', () => {
  it('opens the template workspace from the work, as the photo page and the Photos grid both link it', () => {
    expect(makeAgainHref('pure-white', '5c0d9a8e-1111-4222-8333-444455556666')).toBe('/generate/pure-white?again=5c0d9a8e-1111-4222-8333-444455556666')
    expect(makeAgainHref('a b', 'x&y')).toBe('/generate/a%20b?again=x%26y')
  })
})
