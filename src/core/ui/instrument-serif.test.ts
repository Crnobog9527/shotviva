import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { geistCss } from './geist-fonts'
import { INSTRUMENT_SERIF_FILES } from './instrument-serif'

const root = process.cwd()

describe('Instrument Serif files', () => {
  it('exist under the name their content hashes to', () => {
    for (const href of INSTRUMENT_SERIF_FILES) {
      const file = join(root, 'public', href)
      expect(existsSync(file), href).toBe(true)
      const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
      expect(href).toContain(`-${hash}.woff2`)
    }
  })

  it('are declared with Geist on the fonts host, and nowhere else', () => {
    const css = geistCss('https://cdn.example')
    const declared = [...css.matchAll(/url\(https:\/\/cdn\.example(\/fonts\/instrument-serif\/[^)]+)\)/g)].map((match) => match[1])
    expect(declared.sort()).toEqual([...INSTRUMENT_SERIF_FILES].sort())
    expect(readFileSync(join(root, 'src/app/globals-body.css'), 'utf8')).not.toContain('/fonts/instrument-serif/')
  })

  it('ship with their license', () => {
    expect(readFileSync(join(root, 'public/fonts/instrument-serif/OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE')
  })
})
