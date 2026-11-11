import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOCALES } from '@/core/i18n'

import { FIRST_FRAME_SOURCES, FIRST_FRAMES } from './first-frames.generated'
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

  // A hero photo replaced under the same file name would keep showing the old picture's frame
  // for the first moments of the page.
  it('every frame was made from the picture that is in public/ now (run `pnpm images:first-frames`)', () => {
    expect(Object.keys(FIRST_FRAME_SOURCES).sort()).toEqual(Object.keys(FIRST_FRAMES).sort())
    for (const [src, hash] of Object.entries(FIRST_FRAME_SOURCES)) {
      expect(createHash('sha256').update(readFileSync(join(process.cwd(), 'public', src))).digest('hex'), src).toBe(hash)
    }
  })

  it('the home page and every landing page draw their phone photo with the document', () => {
    for (const locale of LOCALES) {
      const heroes = [homePageIn(locale).hero, ...contentPagesIn(locale).map((page) => page.hero)]
      for (const hero of heroes) expect(hero.before.firstFrame, `${locale} ${hero.before.src}`).toMatch(FRAME)
    }
  })
})
