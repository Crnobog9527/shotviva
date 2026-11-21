/**
 * Warm production's page cache right after a deploy (.github/workflows/warm-production.yml).
 *
 * A new production deployment starts with an empty CDN cache, so the first visitor (or the first
 * PageSpeed run, 2026-11-21: TTFB 1.04 s against 0.19-0.28 s on a HIT) waits for a render. This
 * asks once for each public page in scripts/html-budget.json (the home and landing pages, en and
 * zh, and pricing) with a browser and a Lighthouse user agent, one request at a time, then reads
 * them again and prints what the cache answered. About 50 requests per deploy, never in parallel.
 *
 *   node scripts/warm-cache.mts https://shotviva.com                       # warm now
 *   node scripts/warm-cache.mts https://shotviva.com --expect=dpl_abc       # first wait (max 5 min)
 *                                                                          # until /api/version says dpl_abc
 *   node scripts/warm-cache.mts https://shotviva.com --state=.warm-state    # only if /api/version
 *                                                                          # changed since the last warm
 *                                                     (add --force to warm anyway and record it)
 *
 * Plain Node (no dependencies, runs without pnpm install). Prints paths, statuses and cache
 * headers only: no cookie or token is ever sent.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The same user agents the cache and PageSpeed use: a desktop browser, and PSI's mobile run
// (Chrome-Lighthouse; since #773 it shares the browser's cached page, so this mostly confirms it).
export const WARM_USER_AGENTS: Record<string, string> = {
  browser: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  lighthouse:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
}

const PAUSE_MS = 300
const WAIT_FOR_VERSION_MS = 5 * 60_000

export function warmPaths(budgetJson: string): string[] {
  const budget = JSON.parse(budgetJson) as { profiles: Record<string, Record<string, unknown>> }
  const paths = new Set<string>()
  for (const profile of Object.values(budget.profiles)) for (const path of Object.keys(profile)) paths.add(path)
  return [...paths]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function liveVersion(base: string): Promise<string | null> {
  try {
    const response = await fetch(`${base}/api/version`, { headers: { 'cache-control': 'no-cache' } })
    if (!response.ok) return null
    const body = (await response.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch {
    return null
  }
}

async function hit(base: string, path: string, userAgent: string) {
  const started = performance.now()
  const response = await fetch(`${base}${path}`, {
    headers: { 'user-agent': userAgent, accept: 'text/html', 'accept-encoding': 'br, gzip' },
    redirect: 'follow',
  })
  const firstByte = performance.now() - started
  await response.arrayBuffer()
  return { status: response.status, cache: response.headers.get('x-vercel-cache') ?? '-', ms: Math.round(firstByte) }
}

async function main() {
  const args = process.argv.slice(2)
  const base = args.find((arg) => !arg.startsWith('--'))?.replace(/\/$/, '')
  const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (!base) throw new Error('Usage: node scripts/warm-cache.mts <base-url> [--expect=<deployment id>] [--state=<dir>]')

  const expected = option('expect')
  if (expected) {
    const deadline = Date.now() + WAIT_FOR_VERSION_MS
    while ((await liveVersion(base)) !== expected) {
      if (Date.now() > deadline) {
        process.stdout.write(`${expected} is not serving ${base} after 5 min (not promoted?): nothing warmed\n`)
        return
      }
      await sleep(15_000)
    }
  }

  const version = await liveVersion(base)
  const stateDir = option('state')
  const stateFile = stateDir ? join(stateDir, 'version') : null
  if (stateFile && !expected && !args.includes('--force')) {
    let last = ''
    try {
      last = readFileSync(stateFile, 'utf8').trim()
    } catch {}
    if (version && version === last) {
      process.stdout.write(`${base} still serves ${version}: already warmed\n`)
      return
    }
  }

  const paths = warmPaths(readFileSync(join(process.cwd(), 'scripts/html-budget.json'), 'utf8'))
  process.stdout.write(`warming ${paths.length} pages on ${base} (${version ?? 'version unknown'})\n`)
  const lines: string[] = []
  let failed = 0
  for (const path of paths) {
    for (const [name, userAgent] of Object.entries(WARM_USER_AGENTS)) {
      try {
        const first = await hit(base, path, userAgent)
        await sleep(PAUSE_MS)
        const second = await hit(base, path, userAgent)
        await sleep(PAUSE_MS)
        if (second.status !== 200) failed++
        lines.push(`${path.padEnd(32)} ${name.padEnd(10)} ${first.status} ${first.cache.padEnd(8)} ${String(first.ms).padStart(5)} ms -> ${second.cache.padEnd(8)} ${String(second.ms).padStart(5)} ms`)
      } catch (error) {
        failed++
        lines.push(`${path.padEnd(32)} ${name.padEnd(10)} error: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  process.stdout.write(`${'path'.padEnd(32)} ${'agent'.padEnd(10)} first (status, cache, first byte) -> second\n${lines.join('\n')}\n`)

  if (stateFile && version) {
    mkdirSync(stateDir!, { recursive: true })
    writeFileSync(stateFile, `${version}\n`)
  }
  if (failed) {
    process.stderr.write(`${failed} request(s) did not return 200\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
