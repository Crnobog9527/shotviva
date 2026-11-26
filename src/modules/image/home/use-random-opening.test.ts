import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { randomOpening } from './use-random-opening'

const template = (id: string, covers = true) => ({ id, cover: { before: covers ? `/b/${id}` : null, after: covers ? `/a/${id}` : null } }) as unknown as CatalogueTemplate

describe('the random opening', () => {
  const pool = [template('cake'), template('bare', false), template('steak'), template('soup')]

  it('always picks a member with both covers, across the whole range of the random number', () => {
    for (const value of [0, 0.2, 0.5, 0.74, 0.99, 0.999999]) {
      const pick = randomOpening(pool, () => value)
      expect(pick?.cover.before && pick.cover.after).toBeTruthy()
    }
    expect(randomOpening(pool, () => 0)?.id).toBe('cake')
    expect(randomOpening(pool, () => 0.999999)?.id).toBe('soup')
  })

  it('reaches every usable member', () => {
    const seen = new Set([0, 0.34, 0.67].map((value) => randomOpening(pool, () => value)?.id))
    expect([...seen].sort()).toEqual(['cake', 'soup', 'steak'])
  })

  it('picks nothing from an empty or cover-less pool', () => {
    expect(randomOpening([], () => 0.5)).toBeNull()
    expect(randomOpening([template('bare', false)], () => 0.5)).toBeNull()
  })
})
