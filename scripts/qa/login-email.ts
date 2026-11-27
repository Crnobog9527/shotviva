/**
 * pnpm qa:login-email <email> [--host user|admin|preview] [--next /path]
 *
 * A one-time sign-in link for an already-confirmed TEST-site account that is not a QA persona
 * (an account a validation created through the real sign-up form), mirroring `pnpm qa:login`.
 * It goes through the site's /auth/confirm landing; nothing is emailed.
 * The link is a credential: stdout carries only the link, the warning goes to stderr.
 */
import { loadQaEnv } from './env'
import { buildLoginUrl } from './login-link'
import { assertNotPersona, landingPath, parseLinkArgs, QA_HOSTS } from './signup-link'
import { PREVIEW_REF, QaGuardError } from './target'
import { adminClient, findUserByEmail, retryTransient } from './users'

const USAGE = 'pnpm qa:login-email <email> [--host user|admin|preview] [--next /path]'

async function main() {
  const { email, host, next } = parseLinkArgs(process.argv.slice(2), USAGE)
  assertNotPersona(email)
  // No extra refs: an arbitrary account is only ever signed in on the test project.
  const env = loadQaEnv(['qa-invitee'])
  if (env.ref !== PREVIEW_REF) throw new QaGuardError(`Refusing to run against ${env.ref}.`)
  const db = adminClient(env)

  // generateLink would create a missing user, and a magic link would confirm an unconfirmed
  // one: both would falsify a sign-up test, so only existing confirmed accounts get a link.
  const user = await findUserByEmail(db, email)
  if (!user) throw new QaGuardError(`No account for ${email} on the test project.`)
  if (!user.email_confirmed_at) throw new QaGuardError(`${email} is not confirmed yet; use pnpm qa:confirm-link ${email}.`)
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profileError) throw new Error(`profile lookup failed: ${profileError.message}`)
  if (profile?.role === 'admin') throw new QaGuardError(`${email} is an admin; use the qa-admin persona instead.`)

  const { data, error } = await retryTransient(() => db.auth.admin.generateLink({ type: 'magiclink', email }))
  if (error) throw new Error(`generateLink failed: ${error.message}`)

  process.stderr.write(
    `WARNING: this link signs in as ${email} on ${QA_HOSTS[host]}. Treat it as a password: open it once, ` +
      'in that account’s own window, and never paste it into a PR, issue or chat. ' +
      'It works once and expires with the project’s email-link lifetime (1 hour by default).\n',
  )
  const path = landingPath(next, user.user_metadata?.locale)
  process.stdout.write(`${buildLoginUrl(QA_HOSTS[host], data.properties.hashed_token, path)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`qa:login-email failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
