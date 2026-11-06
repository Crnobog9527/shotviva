import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { groundClass } from './grounded-img'

describe('groundClass', () => {
  it('paints the ground only once the image has loaded', () => {
    expect(groundClass('white', true)).toBe('bg-photo-white')
    expect(groundClass('checker', true)).toBe('checker-ground')
    expect(groundClass('white', false)).toBeUndefined()
    expect(groundClass(undefined, true)).toBeUndefined()
  })
})

// A template's "after" cover can be a transparent cut-out (a white-background template). Every
// component that draws one puts white behind it, or the phone photo underneath shows through and
// the result looks broken (Owner, 2026-11-07). These are the components that draw after covers.
const AFTER_COVERS: [file: string, uses: RegExp][] = [
  ['src/modules/image/catalogue/pair-media.tsx', /<GroundedImg data-wipe="ai" ground="white"/],
  ['src/modules/image/catalogue/compare-slider.tsx', /afterGround = 'white'/],
  ['src/modules/image/home/picker-body.tsx', /<GroundedImg className="mk-a" ground="white"/],
  ['src/modules/image/workspace/workspace-head.tsx', /<GroundedImg ground="white"/],
  ['src/core/content/blocks/photo-pair.tsx', /<WhiteGroundImage className="mk-a"/],
  ['src/core/content/blocks/compare-slider.tsx', /<WhiteGroundImage className="mk-after"/],
]

describe('template after covers', () => {
  it.each(AFTER_COVERS)('%s draws the after cover on white', (file, uses) => {
    expect(readFileSync(file, 'utf8')).toMatch(uses)
  })
})
