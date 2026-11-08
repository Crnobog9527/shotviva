import { isPersonaId, PERSONA_IDS, type PersonaId } from './personas'

/**
 * `pnpm qa:reset <persona>` takes exactly one known persona (T88). Anything else is refused
 * before the script reads .env.local or touches the project, so a typo never falls back to
 * resetting more than was asked.
 */
export function parseResetArgs(argv: readonly string[]): PersonaId {
  const usage = `usage: pnpm qa:reset <persona>; one of ${PERSONA_IDS.join(', ')}`
  if (argv.length !== 1) throw new Error(usage)
  const [id] = argv
  if (!isPersonaId(id)) throw new Error(`Unknown persona ${id}; ${usage}`)
  return id
}
