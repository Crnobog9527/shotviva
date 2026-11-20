/**
 * Raw and gzip HTML of the home and landing pages against scripts/html-budget.json
 * (scripts/html-budget-lib.ts says what each profile guards).
 *
 *   pnpm html:budget http://localhost:3000                       # CI's build (profile "build")
 *   pnpm html:budget https://shotviva.com --profile=live         # a site with the real catalogue
 *   pnpm html:budget <url> --profile=live --print                # just the table
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isOver, measure, profileOf, report, REQUEST_HEADERS, type Budget, type Measured } from './html-budget-lib'

const args = process.argv.slice(2)
const base = args.find((arg) => !arg.startsWith('--'))?.replace(/\/$/, '')
const profileName = args.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length) ?? 'build'
if (!base) throw new Error('Usage: pnpm html:budget <base-url> [--profile=build|live] [--print]')

const budget: Budget = JSON.parse(readFileSync(join(process.cwd(), 'scripts/html-budget.json'), 'utf8'))

async function page(path: string): Promise<Buffer> {
  const response = await fetch(`${base}${path}`, { headers: REQUEST_HEADERS, redirect: 'follow' })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function main() {
  const rows: Measured[] = []
  for (const [path, limit] of Object.entries(profileOf(budget, profileName))) rows.push(measure(path, await page(path), limit))
  process.stdout.write(`html-budget (${profileName}) ${base}\n${report(rows)}\n`)
  if (rows.some(isOver) && !args.includes('--print')) {
    process.stderr.write('HTML over budget. Keep what the first paint does not need out of the page (load it on demand), or raise the budget in scripts/html-budget.json with the reason in the PR.\n')
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
