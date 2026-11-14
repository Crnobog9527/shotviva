import { describe, expect, it } from 'vitest'

import { decideVariant, drawVariant } from './assign'
import type { CookieEntry } from './cookie'
import type { LiveExperiment, LiveVariant } from './types'

const variant = (id: number, patch: Partial<LiveVariant> = {}): LiveVariant => ({ id, option: `o${id}`, weight: 50, control: false, archived: false, fallback: null, ...patch })
const experiment = (patch: Partial<LiveExperiment> = {}): LiveExperiment => ({
  id: 3,
  surface: 'hero',
  status: 'running',
  winner: null,
  variants: [variant(10, { control: true }), variant(11), variant(12, { weight: 0 })],
  ...patch,
})
const held = (current: number, first = current, flag: CookieEntry['flag'] = ''): CookieEntry => ({ experiment: 3, current, first, flag })

describe('drawVariant', () => {
  it('splits by weight and never draws a zero-weight or archived variant', () => {
    const variants = [variant(1, { weight: 25 }), variant(2, { weight: 75 }), variant(3, { weight: 0 }), variant(4, { archived: true })]
    expect(drawVariant(variants, 0)?.id).toBe(1)
    expect(drawVariant(variants, 0.249)?.id).toBe(1)
    expect(drawVariant(variants, 0.25)?.id).toBe(2)
    expect(drawVariant(variants, 0.999)?.id).toBe(2)
    expect(drawVariant([variant(1, { weight: 0 })], 0.5)).toBeNull()
  })

  it('gives an even split even weights', () => {
    const variants = [variant(1), variant(2)]
    const counts = { 1: 0, 2: 0 }
    for (let i = 0; i < 1000; i += 1) counts[drawVariant(variants, i / 1000)!.id as 1 | 2] += 1
    expect(counts).toEqual({ 1: 500, 2: 500 })
  })
})

describe('decideVariant', () => {
  it('draws a new visitor and flags the assignment for reporting', () => {
    expect(decideVariant(experiment(), undefined, 0.9)).toEqual({ variant: variant(11), entry: held(11, 11, 'n') })
  })

  it('keeps a visitor on their variant, with nothing to write', () => {
    expect(decideVariant(experiment(), held(11), 0)).toEqual({ variant: variant(11) })
  })

  it('moves people off an archived variant to its fallback, keeping their first variant', () => {
    const live = experiment({ variants: [variant(10, { control: true }), variant(11, { archived: true, fallback: 12 }), variant(12)] })
    expect(decideVariant(live, held(11), 0)).toEqual({ variant: variant(12), entry: held(12, 11, 'r') })
  })

  it('follows a chain of archived variants and ends on the control when it leads nowhere', () => {
    const live = experiment({ variants: [variant(10, { control: true }), variant(11, { archived: true, fallback: 12 }), variant(12, { archived: true, fallback: 99 })] })
    expect(decideVariant(live, held(11), 0)?.variant.id).toBe(10)
  })

  it('pauses: keeps the assigned, shows the control to new visitors without assigning them', () => {
    const paused = experiment({ status: 'paused' })
    expect(decideVariant(paused, held(11), 0)).toEqual({ variant: variant(11) })
    expect(decideVariant(paused, undefined, 0.9)).toEqual({ variant: variant(10, { control: true }) })
  })

  it('ends: everyone sees the winner (the control when none), nothing is written', () => {
    expect(decideVariant(experiment({ status: 'ended', winner: 11 }), held(10), 0)).toEqual({ variant: variant(11) })
    expect(decideVariant(experiment({ status: 'ended', winner: null }), held(11), 0)).toEqual({ variant: variant(10, { control: true }) })
  })

  it('treats a cookie naming a variant the experiment does not have as a new visitor', () => {
    expect(decideVariant(experiment(), held(999), 0)?.entry).toEqual(held(10, 10, 'n'))
  })

  it('keeps a forced assignment unreported when it is moved', () => {
    const live = experiment({ variants: [variant(10, { control: true }), variant(11, { archived: true, fallback: 10 })] })
    expect(decideVariant(live, held(11, 11, 'f'), 0)?.entry?.flag).toBe('f')
  })
})
