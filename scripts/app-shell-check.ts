/**
 * After `next build`, checks the prerendered shells of the app pages for the top bar
 * (app-shell-check-lib.ts): the bar on the static tab roots, its stand-in on the photo page. Then
 * Create's app shell (ARCHITECTURE §18.3) for anything of an account (app-shell-private-lib.ts):
 * every prerendered file of /app-shell/generate, HTML and RSC segments.
 * Exits 1 with a list of problems. Run by CI right after the build:
 *
 *   pnpm check:app-shell
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { site } from '../src/site/site.config'
import { LOCALES, SHELLS, shellProblems } from './app-shell-check-lib'
import { shellPrivacyProblems } from './app-shell-private-lib'

const root = join(process.cwd(), '.next', 'server', 'app')
const problems: string[] = []
for (const locale of LOCALES) {
  for (const { file, expect } of SHELLS) {
    const path = join(root, locale, file)
    if (!existsSync(path)) {
      problems.push(`${locale}/${file}: no prerendered shell (run next build first)`)
      continue
    }
    for (const problem of shellProblems(readFileSync(path, 'utf8'), expect)) problems.push(`${locale}/${file}: ${problem}`)
  }
}
// Every file the build wrote for the app shell, in each locale.
function shellFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? shellFiles(path) : /\.(html|rsc)$/.test(name) ? [path] : []
  })
}
let shellChecked = 0
for (const locale of LOCALES) {
  const dir = join(root, locale, 'app-shell')
  const files = shellFiles(dir)
  if (files.length === 0) problems.push(`${locale}/app-shell/generate: no prerendered app shell (run next build first)`)
  shellChecked += files.length
  for (const file of files) {
    for (const problem of shellPrivacyProblems(readFileSync(file, 'utf8'), site.brand.domain)) problems.push(`${file.slice(root.length + 1)}: ${problem}`)
  }
}
if (problems.length > 0) {
  process.stderr.write(`App page shells:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`App page shells: the top bar is in all ${LOCALES.length * SHELLS.length}; the app shell's ${shellChecked} files carry nothing of an account.\n`)
}
