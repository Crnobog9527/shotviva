import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOCALES } from '@/core/i18n'

import { FIRST_FRAMES } from './first-frames.generated'
import { contentPagesIn, homePageIn } from './index'

const FRAME = /^data:image\/avif;base64,[A-Za-z0-9+/]+=*$/

describe('hero first frames', () => {
  it('every generated frame belongs to a picture in public/ and stays small', () => {
    for (const [src, frame] of Object.entries(FIRST_FRAMES)) {
      expect(existsSync(join(process.cwd(), 'public', src)), src).toBe(true)
      expect(frame, src).toMatch(FRAME)
      // The home page carries its frame twice (HTML and the hydration data): keep each under
      // 9 KB of picture (12,000 base64 characters).
      expect(frame.length, src).toBeLessThan(12_000)
    }
  })

  it('the home page and every landing page draw their phone photo with the document', () => {
    for (const locale of LOCALES) {
      const heroes = [homePageIn(locale).hero, ...contentPagesIn(locale).map((page) => page.hero)]
      for (const hero of heroes) expect(hero.before.firstFrame, `${locale} ${hero.before.src}`).toMatch(FRAME)
    }
  })
})
