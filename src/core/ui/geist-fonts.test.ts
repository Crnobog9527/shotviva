import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GEIST_FILE, GEIST_MONO_FILE, geistCss } from './geist-fonts'

const root = process.cwd()

describe('Geist files', () => {
  it('exist under the name their content hashes to', () => {
    for (const href of [GEIST_FILE, GEIST_MONO_FILE]) {
      const file = join(root, 'public', href)
      expect(existsSync(file), href).toBe(true)
      const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
      expect(href).toContain(`-${hash}.woff2`)
    }
  })

  it('ship with their license', () => {
    expect(readFileSync(join(root, 'public/fonts/geist/OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE')
  })
})

describe('geistCss', () => {
  it('puts both faces on the given host and defines the variables globals-body.css reads', () => {
    const css = geistCss('https://cdn.example')
    expect(css).toContain(`url(https://cdn.example${GEIST_FILE})`)
    expect(css).toContain(`url(https://cdn.example${GEIST_MONO_FILE})`)
    expect(css).toContain('--font-geist:geist,"geist Fallback"')
    expect(css).toContain('--font-geist-mono:geistMono,"geistMono Fallback"')
    expect(geistCss('')).toContain(`url(${GEIST_FILE})`)
  })

  it('gives each fallback face an Arial-metric font on systems without Arial', () => {
    const faces = geistCss('').match(/@font-face\{font-family:"geist(Mono)? Fallback";src:[^;]+/g) ?? []
    expect(faces).toHaveLength(2)
    for (const face of faces) expect(face).toContain('local(Arial),local(Arimo),local("Liberation Sans")')
  })
})
