/**
 * pnpm qa:confirm-link <email> [--host user|admin|preview] [--next /path]
 *
 * Prints the sign-up confirmation link a TEST-site account was just emailed, rebuilt from the
 * pending token stored on the account (auth.users.confirmation_token), so a validation can
 * finish sign-up without anyone forwarding the email. It only reads: nothing is resent, because
 * a new email moves confirmation_sent_at and by design (migration 2021) drops the account's
 * stored referral, which would falsify a referral test.
 *
 * The link is a credential: stdout carries only the link, everything else goes to stderr.
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

import pg from 'pg'

import { ENV_FILE } from './env'
import { assertNotPersona, assertPending, assertTestDbUrl, buildConfirmLink, landingPath, parseLinkArgs, type PendingSignup } from './signup-link'
import { QaGuardError } from './target'

const USAGE = 'pnpm qa:confirm-link <email> [--host user|admin|preview] [--next /path]'

// Like the other QA secrets: from .env.local only; a different exported shell value is refused.
function testDbUrl(): string {
  if (!existsSync(ENV_FILE)) throw new QaGuardError(`${ENV_FILE} not found; see scripts/qa/README.md.`)
  const value = parseEnv(readFileSync(ENV_FILE, 'utf8')).QA_TEST_DB_URL
  const shell = process.env.QA_TEST_DB_URL
  if (shell !== undefined && shell !== value) {
    throw new QaGuardError(`QA_TEST_DB_URL in your shell differs from ${ENV_FILE}; unset it.`)
  }
  return assertTestDbUrl(value)
}

type Row = PendingSignup & { locale: string | null }

async function readPending(connectionString: string, email: string): Promise<Row | undefined> {
  // Supabase's server certificate is signed by Supabase's own CA, which Node does not trust by
  // default; the host was pinned to the test project above.
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })
  await client.connect()
  try {
    await client.query('begin read only')
    const { rows } = await client.query<Row>(
      `select email_confirmed_at, confirmation_token, confirmation_sent_at,
              raw_user_meta_data->>'locale' as locale
         from auth.users
        where lower(email) = $1 and deleted_at is null and not is_anonymous`,
      [email],
    )
    await client.query('rollback')
    if (rows.length > 1) throw new QaGuardError(`More than one account matches ${email}.`)
    return rows[0]
  } finally {
    await client.end()
  }
}

async function main() {
  const { email, host, next } = parseLinkArgs(process.argv.slice(2), USAGE)
  assertNotPersona(email)
  const connectionString = testDbUrl()
  const row = await readPending(connectionString, email)
  const token = assertPending(row, email)
  const link = buildConfirmLink(host, token, landingPath(next, row?.locale))

  process.stderr.write(
    `WARNING: this link confirms ${email} on the test site (${host}). Treat it as a password: open it ` +
      'once, in the browser the validation step names, and never paste it into a PR, issue or chat. ' +
      'Opening it signs that browser in and uses the token up.\n',
  )
  process.stdout.write(`${link}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`qa:confirm-link failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
