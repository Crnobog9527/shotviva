/**
 * Writes public/presized/…: fixed-width WebP copies of public/{home,cases,intros,partners}
 * (scripts/presize-public-lib.ts, core/presized). `pnpm dev` and `pnpm build` run it first; the
 * files are build products (.gitignore), rewritten only when their picture is newer.
 *
 *   pnpm images:presize
 */
import { join } from 'node:path'

import { writePublicCopies } from './presize-public-lib'

const started = Date.now()
void writePublicCopies(join(process.cwd(), 'public')).then(({ written, kept }) => {
  process.stdout.write(`public/presized: ${written} written, ${kept} up to date (${Date.now() - started} ms)\n`)
})
