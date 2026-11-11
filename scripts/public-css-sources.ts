/**
 * Writes src/app/public-sources.generated.css: one @source line per file the public pages can
 * load (scripts/public-css-sources-lib.ts). The file is a build product, not committed:
 * `pnpm dev` and `pnpm build` run this first, so the list always follows the import graph of the
 * code being built, and `pnpm css:check` proves after the build that no class went missing.
 * While `next dev` is running, run it by hand after making a marketing or sign-in page import a
 * file it did not before (or restart dev).
 *
 *   pnpm css:sources
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { GENERATED, generatedCss, reachableSources } from './public-css-sources-lib'

const root = process.cwd()
writeFileSync(join(root, GENERATED), generatedCss(root))
process.stdout.write(`${GENERATED}: ${reachableSources(root).length} files\n`)
