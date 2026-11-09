import { loadQaEnv } from './env'
import { PERSONAS, type PersonaId } from './personas'
import { setupPersona } from './setup-persona'
import { formatTable, readState } from './state'
import { qaStorage } from './storage'
import { adminClient } from './users'

/**
 * Sets up the given personas on the preview project and prints the state table (T24). Shared by
 * `pnpm qa:accounts` (all five) and `pnpm qa:reset <persona>` (one, T88), so both leave a persona
 * in exactly the same state.
 */
export async function runPersonas(command: string, ids: readonly PersonaId[]): Promise<void> {
  const env = loadQaEnv(ids)
  const db = adminClient(env)
  const storage = qaStorage(env.ref, env.r2)
  process.stdout.write(`${command} → Supabase ${env.ref}\n`)
  if (!storage.enabled) process.stdout.write('R2 not configured (local stack): placeholder files are skipped.\n')

  const rows = []
  const ownerSteps: string[] = []
  // One at a time: each persona is a handful of calls and the order keeps output readable.
  for (const id of ids) {
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
