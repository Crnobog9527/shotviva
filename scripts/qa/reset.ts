/**
 * pnpm qa:reset <persona>: resets one QA persona on the preview project to its starting state
 * (T88), the same way `pnpm qa:accounts` does, and leaves the other four alone. For Codex to fix
 * its own lane's persona during parallel validation. See README.md.
 */
import { parseResetArgs } from './reset-args'
import { runPersonas } from './run-personas'

async function main() {
  const id = parseResetArgs(process.argv.slice(2))
  await runPersonas(`qa:reset ${id}`, [id])
}

main().catch((error: unknown) => {
  process.stderr.write(`qa:reset failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
