/**
 * Writes src/app/public-sources.generated.css: one @source line per file the public pages can
 * load (scripts/public-css-sources-lib.ts). Run it after a change makes a marketing or sign-in
 * page import a file it did not before; public-css-sources.test.ts fails until it is run.
 *
 *   pnpm css:sources
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { GENERATED, generatedCss, reachableSources } from './public-css-sources-lib'

const root = process.cwd()
writeFileSync(join(root, GENERATED), generatedCss(root))
process.stdout.write(`${GENERATED}: ${reachableSources(root).length} files\n`)
