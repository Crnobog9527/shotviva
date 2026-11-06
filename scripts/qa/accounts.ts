/**
 * pnpm qa:accounts: creates or resets the five QA personas on the preview project (T24).
 * Safe to rerun; two runs in a row leave the same state. Sends no email. See README.md.
 */
import { loadQaEnv } from './env'
import { PERSONA_IDS, PERSONAS } from './personas'
import { setupPersona } from './setup-persona'
import { formatTable, readState } from './state'
import { qaStorage } from './storage'
import { adminClient } from './users'

async function main() {
  const env = loadQaEnv()
  const db = adminClient(env)
  const storage = qaStorage(env.ref, env.r2)
  process.stdout.write(`qa:accounts → Supabase ${env.ref}\n`)
  if (!storage.enabled) process.stdout.write('R2 not configured (local stack): placeholder files are skipped.\n')

  const rows = []
  const ownerSteps: string[] = []
  // One at a time: each persona is a handful of calls and the order keeps output readable.
  for (const id of PERSONA_IDS) {
    const persona = PERSONAS[id]
    const result = await setupPersona({ db, storage }, persona)
    if (result.ownerStep) ownerSteps.push(result.ownerStep)
    rows.push({ ...(await readState(db, persona, result.userId)), action: result.outcome })
  }

  process.stdout.write(`\n${formatTable(rows)}\n`)
  if (ownerSteps.length > 0) {
    process.stdout.write('\nOwner step (once, Supabase → SQL Editor on the preview project):\n')
    for (const step of ownerSteps) process.stdout.write(`  ${step}\n`)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`qa:accounts failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
