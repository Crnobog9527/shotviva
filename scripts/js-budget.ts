/**
 * First-load JavaScript per route, from a finished `next build` (no server needed): every
 * module <script src> in the route's prerendered shell (.next/server/app/<route>.html), gzip-sized
 * from .next/static. Fails when a route is over its budget (scripts/js-budget.json).
 *
 *   pnpm build && pnpm js:budget            # check
 *   pnpm js:budget --print                  # just the table
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

type Budget = { routes: Record<string, number>; note?: string }

const NEXT = join(process.cwd(), '.next')
const budget: Budget = JSON.parse(readFileSync(join(process.cwd(), 'scripts/js-budget.json'), 'utf8'))

const gzipped = new Map<string, number>()
function gzipSize(src: string): number {
  const cached = gzipped.get(src)
  if (cached !== undefined) return cached
  const file = join(NEXT, src.replace(/^\/_next\//, '').split('?')[0])
  const size = existsSync(file) ? gzipSync(readFileSync(file), { level: 9 }).length : 0
  gzipped.set(src, size)
  return size
}

function scriptsOf(route: string): string[] {
  const html = readFileSync(join(NEXT, 'server/app', `${route}.html`), 'utf8')
  // noModule polyfills only run on browsers without ES modules; every target browser skips them.
  const tags = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*>/g)].filter((m) => !/noModule/i.test(m[0]))
  return [...new Set(tags.map((m) => m[1]))]
}

let failed = false
const rows: string[] = []
for (const [route, limitKb] of Object.entries(budget.routes)) {
  const scripts = scriptsOf(route)
  const kb = scripts.reduce((sum, src) => sum + gzipSize(src), 0) / 1024
  const over = kb > limitKb
  if (over) failed = true
  rows.push(`${over ? 'OVER' : 'ok  '} ${route.padEnd(36)} ${kb.toFixed(1).padStart(6)} KB gz  / budget ${limitKb} KB  (${scripts.length} files)`)
}
process.stdout.write(`${rows.join('\n')}\n`)
if (failed && !process.argv.includes('--print')) {
  process.stderr.write('First-load JS over budget. Split the code (next/dynamic) or raise the budget in scripts/js-budget.json with a reason in the PR.\n')
  process.exitCode = 1
}
