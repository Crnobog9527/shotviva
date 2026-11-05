import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'

import { buildPayload, emptyFormValues, matchesSearch, moveId, toFormValues } from './form-state'

const template: AdminTemplate = {
  id: 'burger-hero',
  module: 'image',
  name: 'Burger hero',
  category: 'burgers',
  coverBeforeUrl: null,
  coverAfterUrl: null,
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  creditsCost: 1,
  sortOrder: 10,
  isActive: true,
  visibleIn: ['web', 'partner'],
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-05T00:00:00Z',
  prompt: { body: 'FAKE BODY', version: 2, modelParams: { quality: 'high' } },
}

describe('template form state', () => {
  it('round-trips a template into a save payload', () => {
    const result = buildPayload(toFormValues(template), false)
    expect(result).toEqual({
      ok: true,
      payload: {
        isNew: false,
        template: expect.objectContaining({ id: 'burger-hero', visibleIn: ['web', 'partner'] }),
        prompt: { body: 'FAKE BODY', modelParams: { quality: 'high' } },
      },
    })
  })

  it('rejects invalid JSON and empty surfaces before calling the server', () => {
    expect(buildPayload({ ...emptyFormValues(), fieldsJson: '{' }, true)).toMatchObject({ ok: false })
    const noSurface = { ...emptyFormValues(), visibleWeb: false, visiblePartner: false }
    expect(buildPayload(noSurface, true)).toMatchObject({ ok: false })
  })

  it('moves ids within bounds only', () => {
    expect(moveId(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveId(['a', 'b', 'c'], 2, 1)).toBeNull()
    expect(moveId(['a', 'b', 'c'], 0, -1)).toBeNull()
  })

  it('searches id, name and category', () => {
    expect(matchesSearch(template, 'BURG')).toBe(true)
    expect(matchesSearch(template, 'pizza')).toBe(false)
    expect(matchesSearch(template, ' ')).toBe(true)
  })
})
