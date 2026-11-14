/**
 * pnpm qa:login <persona> [--next /path]: prints a one-time sign-in link for a QA persona
 * (T24). It goes through the site's existing /auth/confirm landing; nothing is emailed.
 * The link is a credential: stdout carries only the link, the warning goes to stderr.
 */
import { loadQaEnv } from './env'
import { buildLoginUrl, checkNext, parseLoginArgs } from './login-link'
import { isPersonaId, PERSONA_IDS, PERSONAS } from './personas'
import { adminClient, findUserByEmail, retryTransient } from './users'

async function main() {
  const { persona: id, next } = parseLoginArgs(process.argv.slice(2))
  if (!isPersonaId(id)) throw new Error(`Unknown persona ${id}; one of ${PERSONA_IDS.join(', ')}`)
  const path = checkNext(next)
  const env = loadQaEnv([id])
  const db = adminClient(env)
  const persona = PERSONAS[id]

  // generateLink would create a missing user for some types; insist on qa:accounts first.
  if (!(await findUserByEmail(db, persona.email))) throw new Error(`${id} does not exist; run pnpm qa:accounts first.`)
  const { data, error } = await retryTransient(() => db.auth.admin.generateLink({ type: 'magiclink', email: persona.email }))
  if (error) throw new Error(`generateLink failed: ${error.message}`)

  process.stderr.write(
    `WARNING: this link signs in as ${id} on ${env.siteUrl}. Treat it as a password: open it once, ` +
      'in that persona’s own window, and never paste it into a PR, issue or chat. ' +
      'It works once and expires with the project’s email-link lifetime (1 hour by default).\n',
  )
  process.stdout.write(`${buildLoginUrl(env.siteUrl, data.properties.hashed_token, path)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`qa:login failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
