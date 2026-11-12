import { describe, expect, it } from 'vitest'

import { phoneSlot } from './phone-sizes'

// next/image's srcset widths around a phone card (next.config.ts defaults).
const WIDTHS = [256, 384, 640, 750, 828, 1080]
const picked = (viewport: number, slot: string, dpr: number) => WIDTHS.find((w) => w >= (viewport * parseInt(slot, 10) * dpr) / 100)

describe('phoneSlot', () => {
  it('makes a 3× phone fetch the 384 w file for a half-row card, up to a 430 px phone', () => {
    expect(phoneSlot(50)).toBe('29vw')
    for (const viewport of [360, 375, 390, 393, 412, 428, 430]) expect(picked(viewport, phoneSlot(50), 3)).toBe(384)
  })

  it('scales other slots the same way', () => {
    expect(phoneSlot(100)).toBe('58vw')
    expect(phoneSlot(46)).toBe('26vw')
  })
})
