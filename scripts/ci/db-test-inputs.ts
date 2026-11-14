/**
 * Decides whether a change needs the "supabase db tests" job (T88). Reads changed paths (one per
 * line) on stdin and prints `true` when any of them can change what that job runs or tests:
 *
 *   - the database itself: supabase/**, any *.sql file
 *   - the DB tests and everything they import, followed file by file from tests/db/**
 *     (`@/…` resolves to src/, relative paths as usual, npm packages are skipped), so a new
 *     test that imports a new module is covered without editing this file
 *   - what installs, configures or runs them: package.json, the lockfile, .nvmrc, tsconfig,
 *     vitest.config.ts, scripts/db-schema.ts, the CI workflow, .github/actions/, scripts/ci/
 *
 * Anything else (pages, components, messages, styles, content) prints `false`. No paths at all
 * prints `true`, so an unexpected empty diff runs the job.
 *
 *   git diff --name-only base HEAD | node scripts/ci/db-test-inputs.ts
 *
 * Runs with plain Node (type stripping, built-ins only), before any install.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALWAYS = [
  /^supabase\//,
  /\.sql$/,
  /^tests\/(db|release)\//,
  /^\.github\/actions\//,
  /^\.github\/workflows\/ci\.yml$/,
  /^scripts\/ci\//,
  /^scripts\/release\/pricing-v2\//,
  /^scripts\/db-schema\.ts$/,
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.nvmrc|tsconfig\.json|vitest\.config\.m?ts)$/,
]

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.js']

// import … from 'x', export … from 'x', import 'x', import('x'), require('x'), vi.mock('x').
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bvi\.mock\s*\(\s*)['"]([^'"\n]+)['"]/g

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function resolveSpecifier(root: string, fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(root, 'src', specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null
  for (const extension of EXTENSIONS) {
    const candidate = base + extension
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Every repo file (relative, forward slashes) the DB tests load, starting from tests/db. */
export function dbTestClosure(root: string): Set<string> {
  const seen = new Set<string>()
  const queue = walk(join(root, 'tests', 'db')).filter((path) => /\.(ts|tsx)$/.test(path))
  while (queue.length > 0) {
    const file = normalize(queue.pop() as string)
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) continue
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const target = resolveSpecifier(root, file, match[1])
      if (target && !seen.has(normalize(target))) queue.push(target)
    }
  }
  return new Set([...seen].map((file) => relative(root, file).split('\\').join('/')))
}

export function needsDbTests(root: string, paths: string[]): boolean {
  const changed = paths.map((path) => path.trim()).filter(Boolean)
  if (changed.length === 0) return true
  if (changed.some((path) => ALWAYS.some((pattern) => pattern.test(path)))) return true
  const closure = dbTestClosure(root)
  return changed.some((path) => closure.has(path))
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const input = readFileSync(0, 'utf8')
  const root = resolve(dirname(self), '..', '..')
  process.stdout.write(`${needsDbTests(root, input.split('\n'))}\n`)
}
