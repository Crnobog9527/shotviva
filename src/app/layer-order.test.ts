import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Cascade layers rank by first mention, in the order the page's CSS arrives. On the 404 pages a
// component's CSS (marketing.css via the marketing chrome, the banner) reached the page ahead of
// globals.css, so `components` was named before Tailwind's `base` and ranked below it: the
// preflight `* { padding: 0; margin: 0 }` beat every component rule. The top bar lost its side
// gutters, and the Log in pill's hit area hung 2px past the right edge (377px document at 375).
// Every stylesheet that opens a layer therefore states the whole order first, in Tailwind's own
// order, so the ranking holds whichever file arrives first.
const LAYER_ORDER = '@layer properties, theme, base, components, utilities;'

const SRC = fileURLToPath(new URL('..', import.meta.url))
// globals.css opens with @import "tailwindcss", which declares the same order itself, and CSS
// allows nothing but @import ahead of an @import.
const OWNS_ORDER = new Set(['app/globals.css'])

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('CSS layer order', () => {
  const layered = cssFiles(SRC)
    .map((path) => ({ name: relative(SRC, path), css: readFileSync(path, 'utf8') }))
    .filter(({ name, css }) => !OWNS_ORDER.has(name) && /@layer\b/.test(stripComments(css)))

  it('finds the layered stylesheets', () => {
    expect(layered.map(({ name }) => name)).toContain('app/[locale]/(marketing)/marketing.css')
  })

  it.each(layered.map(({ name, css }) => [name, css]))('%s states the layer order before anything else', (_name, css) => {
    expect(stripComments(css).trimStart().startsWith(LAYER_ORDER)).toBe(true)
  })
})
