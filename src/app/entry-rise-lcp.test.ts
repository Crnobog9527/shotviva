import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// The entry rises of the public pages move content; they never fade it in. Chrome does not record
// a text paint made at opacity 0, and an opacity animation runs on the compositor without a
// repaint, so a faded-in block reaches the LCP record only at its next repaint. On the sign-in
// pages that was the Geist swap: mobile LCP ~1.2 s after the first paint (2026-11-14).
const SHEETS = {
  'au-rise': '[locale]/(auth)/auth.css',
  'mk-rise': '[locale]/(marketing)/marketing.css',
}

function keyframes(css: string, name: string): string {
  const at = css.indexOf(`@keyframes ${name}`)
  if (at < 0) throw new Error(`@keyframes ${name} not found`)
  let depth = 0
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  throw new Error(`@keyframes ${name} not closed`)
}

describe('entry rises keep the first paint countable', () => {
  for (const [name, file] of Object.entries(SHEETS)) {
    it(`${name} animates no opacity`, () => {
      const css = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(keyframes(css, name)).not.toMatch(/opacity/)
    })
  }
})
