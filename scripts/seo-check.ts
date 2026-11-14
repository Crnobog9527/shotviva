/**
 * Checks a live deployment against the pre-launch indexing switch (ARCHITECTURE §12.0):
 *
 *   pnpm seo:check https://shotviva.com --expect=closed
 *
 * Fetches /, /robots.txt, /sitemap.xml, /sitemap-pages.xml and /llms.txt (following redirects,
 * so production's vercel.app address checks the domain it lands on) and exits 1 with a list of
 * everything that does not match. Run daily by .github/workflows/seo-check.yml; the launch PR
 * flips that workflow's expectation from closed to open.
 */
import { CHECKED_PATHS, evaluate, parseArgs, type Fetched, type Snapshot } from './seo-check-lib'

const USER_AGENT = 'shotviva-seo-check/1.0 (+https://github.com/Crnobog9527/shotviva)'

async function get(origin: string, path: string): Promise<Fetched> {
  const response = await fetch(new URL(path, origin), { redirect: 'follow', headers: { 'User-Agent': USER_AGENT } })
  return { status: response.status, xRobotsTag: response.headers.get('x-robots-tag'), body: await response.text() }
}

async function main() {
  const { origin, expectation } = parseArgs(process.argv.slice(2))
  const entries = await Promise.all(
    Object.entries(CHECKED_PATHS).map(async ([key, path]) => [key, await get(origin, path)] as const),
  )
  const problems = evaluate(Object.fromEntries(entries) as Snapshot, expectation)
  if (problems.length === 0) {
    process.stdout.write(`${origin}: indexing is ${expectation}, as expected.\n`)
    return
  }
  process.stderr.write(`${origin}: expected indexing ${expectation}, found:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`)
  process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
