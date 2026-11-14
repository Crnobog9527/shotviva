/**
 * Fingerprint of what the Lighthouse pages send (CI, .github/workflows/ci.yml). With a built app
 * running (`pnpm start`), fetches every page lighthouserc*.json measures and hashes, per page:
 *
 *   - the status and response headers (minus the ones that differ per request: date, etc.)
 *   - the HTML, with the build id replaced by a constant (it is random per build)
 *   - the contents of every /_next/static file the HTML references, in the order referenced;
 *     content-hashed chunk names mean a changed lazily loaded chunk changes its importer too
 *
 * plus every file in public/. Two builds whose fingerprints match send the same bytes on those
 * pages, so Lighthouse on one measures the other: CI skips Lighthouse when the PR's fingerprint
 * equals its base commit's. Any page that fails to load, or anything else unexpected, exits
 * non-zero so the caller runs Lighthouse.
 *
 *   node scripts/ci/page-fingerprint.mjs http://localhost:3000 > fingerprint.json
 *
 * Prints {"hash": "...", "pages": {"/": "...", ...}}; with FINGERPRINT_DETAIL=<dir>, also writes
 * each page's normalized HTML and asset list there, to diff two fingerprints by hand.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// FINGERPRINT_ROOT: the checkout that was built, when this script runs from another one.
const root = process.env.FINGERPRINT_ROOT ?? new URL('../..', import.meta.url).pathname
const origin = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const detail = process.env.FINGERPRINT_DETAIL

// What Lighthouse loads: the URLs of both configs, as paths.
const paths = [
  ...new Set(
    ['lighthouserc.json', 'lighthouserc.devtools.json'].flatMap((file) =>
      JSON.parse(readFileSync(join(root, file), 'utf8')).ci.collect.url.map((url) => new URL(url).pathname),
    ),
  ),
].sort()

// Differ per request or per process, never per build.
const VOLATILE_HEADERS = new Set(['date', 'connection', 'keep-alive', 'transfer-encoding', 'x-request-id', 'set-cookie'])

const buildId = readFileSync(join(root, '.next', 'BUILD_ID'), 'utf8').trim()
const sha = (data) => createHash('sha256').update(data).digest('hex')

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
}

async function page(path) {
  const response = await fetch(origin + path, {
    redirect: 'manual',
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent':
        'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    },
  })
  const html = (await response.text()).split(buildId).join('BUILD_ID')
  if (response.status >= 500) throw new Error(`${path} answered ${response.status}`)
  const headers = [...response.headers]
    .filter(([name]) => !VOLATILE_HEADERS.has(name))
    .map(([name, value]) => `${name}: ${value.split(buildId).join('BUILD_ID')}`)
    .sort()
  // In attributes and in the escaped RSC payload alike ("\/_next\/static\/…").
  const assets = [
    ...new Set([...html.replaceAll('\\/', '/').matchAll(/\/_next\/static\/([^"'\s)\\?#]+)/g)].map((m) => m[1])),
  ]
  const hash = createHash('sha256')
  hash.update(`${response.status}\n${headers.join('\n')}\n\n${html}\n`)
  const listed = []
  for (const asset of assets) {
    const file = join(root, '.next', 'static', decodeURIComponent(asset).split('BUILD_ID').join(buildId))
    const content = existsSync(file) ? readFileSync(file) : 'missing'
    const digest = sha(content)
    hash.update(`${asset} ${digest}\n`)
    listed.push(`${asset} ${digest}`)
  }
  if (detail) {
    const name = path === '/' ? 'root' : path.slice(1).replaceAll('/', '_')
    mkdirSync(detail, { recursive: true })
    writeFileSync(join(detail, `${name}.html`), `${response.status}\n${headers.join('\n')}\n\n${html}`)
    writeFileSync(join(detail, `${name}.assets.txt`), listed.join('\n') + '\n')
  }
  return hash.digest('hex')
}

const pages = {}
for (const path of paths) pages[path] = await page(path)

const publicHash = createHash('sha256')
for (const file of walk(join(root, 'public'))) publicHash.update(`${relative(root, file)} ${sha(readFileSync(file))}\n`)
pages['public/'] = publicHash.digest('hex')

process.stdout.write(`${JSON.stringify({ hash: sha(JSON.stringify(pages)), pages })}\n`)
