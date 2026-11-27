import { describe, expect, it } from 'vitest'

import { slotMaxPx } from '../../../core/ui/srcset-cap'
import { COVER_SIZES } from './cover-sizes'

// The stored widths a grid cover's srcset lists (core/presized PRESIZED_WIDTHS).
const WIDTHS = [128, 256, 384, 640, 750, 828, 1080, 1200, 1600]

// What a browser does with `sizes`: the first entry whose condition holds names the slot, and it
// takes the first width at least slot × DPR.
function picked(sizes: string, viewport: number, dpr: number): number | undefined {
  for (const entry of sizes.split(',').map((part) => part.trim())) {
    const match = /^(?:\((min-width|min-resolution):\s*([\d.]+)(?:px|dppx)\)\s+)?([\d.]+)(px|vw)$/.exec(entry)
    if (!match) throw new Error(`unexpected entry ${entry}`)
    const [, feature, bound, value = '', unit] = match
    if (feature === 'min-width' && viewport < Number(bound)) continue
    if (feature === 'min-resolution' && dpr < Number(bound)) continue
    const slot = unit === 'px' ? Number(value) : (Number(value) / 100) * viewport
    return WIDTHS.find((width) => width >= slot * dpr)
  }
  return undefined
}

describe('COVER_SIZES on phones', () => {
  it('makes a 3× phone fetch about a 2× file for the grid covers, never a 3× one', () => {
    // The slot each is drawn at on a phone (the default entry), as a share of the viewport.
    const drawn = { cardPlate: 50, cardFrame: 100, artCard: 100, railPlate: 38, railFrame: 75, artSection: 44, featurePlate: 50, featureFrame: 100 } as const
    for (const viewport of [360, 375, 390, 393, 412, 430]) {
      for (const [key, share] of Object.entries(drawn)) {
        const css = (share / 100) * viewport
        const density = (picked(COVER_SIZES[key as keyof typeof drawn], viewport, 3) ?? 0) / css
        expect(density, `${key} at ${viewport}px`).toBeGreaterThanOrEqual(1.6)
        expect(density, `${key} at ${viewport}px`).toBeLessThan(2.6)
      }
    }
    // Create's largest paint, a rail plate on a 390 px phone: 384 w, where it took 640 w before.
    expect(picked(COVER_SIZES.railPlate, 390, 3)).toBe(384)
    expect(picked('(min-width: 1024px) 182px, (min-width: 768px) 25vw, 38vw', 390, 3)).toBe(640)
  })

  it('leaves 1× and 2× phones, tablets and desktops on their exact slots', () => {
    expect(picked(COVER_SIZES.cardPlate, 390, 2)).toBe(640)
    expect(picked(COVER_SIZES.railPlate, 390, 2)).toBe(384)
    expect(picked(COVER_SIZES.cardPlate, 800, 3)).toBe(640)
    expect(picked(COVER_SIZES.cardPlate, 1280, 3)).toBe(640)
  })

  it('keeps every grid slot readable by the srcset cap (core/ui/srcset-cap)', () => {
    for (const key of ['cardPlate', 'cardFrame', 'artCard', 'railPlate', 'railFrame', 'artSection', 'featurePlate', 'featureFrame'] as const) {
      expect(slotMaxPx(COVER_SIZES[key])).not.toBeNull()
    }
  })
})
