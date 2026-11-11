/**
 * After `next build`: the public pages' Tailwind sheet (globals-public.css) against the app's
 * (globals.css).
 *
 * 1. Nothing missing: every utility class the app's sheet has, and that appears in a file the
 *    public pages can load, must be in the public sheet too. Tailwind reads those files through
 *    the @source lines of public-sources.generated.css; a line that silently matches nothing
 *    (a path with [ ] ( ) in it once did) leaves a marketing page partly unstyled, and only there.
 * 2. No variable missing: a custom property that any stylesheet of a public page reads (without a
 *    fallback) and that the app's sheet defines must be defined on that page too. Tailwind writes
 *    a theme variable only into a sheet whose own sources use it; the marketing H1 once lost
 *    --text-title that way.
 * 3. Still small: the public sheet stays under its budget, so the split is not undone unnoticed.
 *
 *   pnpm build && pnpm css:check
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { reachableSources } from './public-css-sources-lib'

// KB gzip. 18.9 when the split landed (2026-11-11), against 27.4 for the app's sheet.
const PUBLIC_SHEET_BUDGET_KB = 20

const root = process.cwd()
const chunks = join(root, '.next/static/chunks')

// Both Tailwind sheets open with the properties layer's own rules; component sheets open with a
// layer-order statement (src/app/layer-order.test.ts).
const sheets = readdirSync(chunks)
  .filter((name) => name.endsWith('.css'))
  .map((name) => readFileSync(join(chunks, name), 'utf8'))
  .filter((css) => css.startsWith('@layer properties{'))
  .sort((a, b) => b.length - a.length)

function classesOf(css: string): Set<string> {
  const found = new Set<string>()
  for (const match of css.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) found.add(match[1].replace(/\\(.)/g, '$1'))
  return found
}

const definedIn = (css: string) => new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((match) => match[1]))
// var(--x) with nothing after the name: a use that has no fallback of its own.
const readIn = (css: string) => new Set([...css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)].map((match) => match[1]))

// The prerendered shells of a few public pages, one per kind: what they link and what they inline.
const PUBLIC_PAGES = ['en', 'zh', 'en/pricing', 'en/login', 'en/signup', 'en/terms', 'en/commercial-photography']

function stylesOf(page: string): string {
  const html = readFileSync(join(root, '.next/server/app', `${page}.html`), 'utf8')
  const linked = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/_next\/static\/chunks\/([^"?]+)/g)].map((match) => readFileSync(join(chunks, match[1]), 'utf8'))
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1])
  return [...linked, ...inline].join('\n')
}

function undefinedVariables(app: string): string[] {
  const inApp = definedIn(app)
  const found = new Set<string>()
  for (const page of PUBLIC_PAGES) {
    const css = stylesOf(page)
    const defined = definedIn(css)
    // Only variables the app's sheet defines: the rest are set from script or inline styles.
    for (const name of readIn(css)) if (!defined.has(name) && inApp.has(name)) found.add(`${name} (${page})`)
  }
  return [...found].sort()
}

function main(): number {
  if (sheets.length !== 2) {
    process.stderr.write(`Expected two Tailwind sheets in .next/static/chunks (globals.css and globals-public.css), found ${sheets.length}.\n`)
    return 1
  }
  const [app, publicSheet] = sheets
  const inPublic = classesOf(publicSheet)
  const tokens = new Set<string>()
  for (const file of reachableSources(root)) for (const token of readFileSync(join(root, file), 'utf8').split(/[\s"'`<>{}()=,;]+/)) tokens.add(token)
  // A bare number is a decimal's tail in the CSS (`.85`), never a class.
  const missing = [...classesOf(app)].filter((name) => !inPublic.has(name) && tokens.has(name) && !/^\d+$/.test(name))
  const kb = gzipSync(publicSheet, { level: 9 }).length / 1024
  process.stdout.write(`public sheet ${kb.toFixed(1)} KB gz / budget ${PUBLIC_SHEET_BUDGET_KB} KB (app sheet ${(gzipSync(app, { level: 9 }).length / 1024).toFixed(1)} KB gz), ${inPublic.size} classes\n`)
  if (missing.length > 0) {
    process.stderr.write(`Used by a public page but missing from the public sheet: ${missing.join(' ')}\nRun \`pnpm css:sources\`; if the list is current, an @source line is not matching its file.\n`)
    return 1
  }
  const undefinedOnPublic = undefinedVariables(app)
  if (undefinedOnPublic.length > 0) {
    process.stderr.write(`Read by a public page's styles but defined only in the app's sheet: ${undefinedOnPublic.join(', ')}\nDeclare the token in a \`@theme static\` block of globals-body.css.\n`)
    return 1
  }
  if (kb > PUBLIC_SHEET_BUDGET_KB) {
    process.stderr.write('The public sheet is over budget: a marketing or sign-in page now imports something heavy (often through an index.ts barrel).\n')
    return 1
  }
  return 0
}

process.exitCode = main()
