/**
 * pnpm qa:accounts: creates or resets the five QA personas on the preview project (T24).
 * Safe to rerun; two runs in a row leave the same state. Sends no email. See README.md.
 */
import { BULK_PERSONA_IDS } from './personas'
import { runPersonas } from './run-personas'

runPersonas('qa:accounts', BULK_PERSONA_IDS).catch((error: unknown) => {
  process.stderr.write(`qa:accounts failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
