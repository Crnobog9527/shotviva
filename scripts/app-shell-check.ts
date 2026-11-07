/**
 * After `next build`, checks the prerendered shells of the app pages for the top bar
 * (app-shell-check-lib.ts): the bar on the static tab roots, its stand-in on the photo page.
 * Exits 1 with a list of problems. Run by CI right after the build:
 *
 *   pnpm check:app-shell
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LOCALES, SHELLS, shellProblems } from './app-shell-check-lib'

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
if (problems.length > 0) {
  process.stderr.write(`App page shells:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`App page shells: the top bar is in all ${LOCALES.length * SHELLS.length}.\n`)
}
