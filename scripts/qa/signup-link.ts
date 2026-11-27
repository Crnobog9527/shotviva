// Pure helpers for `pnpm qa:confirm-link` and `pnpm qa:login-email` (unit-tested in
// signup-link.test.ts). Both only ever touch the test project (PREVIEW_REF).
import { confirmUrl } from '../../src/core/auth/flows/callback-url'
import { DEFAULT_AFTER_LOGIN, nextIn, sanitizeNext } from '../../src/core/auth/redirect-target'
import { isLocale } from '../../src/core/i18n/locales'
import { PERSONAS } from './personas'
import { PREVIEW_REF, PRODUCTION_REFS, QaGuardError } from './target'

// The test-site hosts a link may open (PREVIEW_EXTRA_HOSTS on Vercel Preview, plus the branch URL).
export const QA_HOSTS = {
  user: 'https://shotviva-qa-user.vercel.app',
  admin: 'https://shotviva-qa-admin.vercel.app',
  preview: 'https://shotviva-git-validation-preview-simons-projects-bfe3e99f.vercel.app',
} as const
export type QaHost = keyof typeof QA_HOSTS

// Same shape /auth/confirm accepts (core/auth/flows/confirm-params.ts).
const TOKEN_HASH = /^[A-Za-z0-9_-]{8,256}$/
// A deliberately simple check: the address is only used as a lookup key.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type LinkArgs = { email: string; host: QaHost; next: string | undefined }

function takeFlag(args: string[], flag: string, usage: string): string | undefined {
  const at = args.indexOf(flag)
  if (at === -1) return undefined
  const value = args[at + 1]
  if (value === undefined || value.startsWith('--')) throw new QaGuardError(`${flag} needs a value. ${usage}`)
  args.splice(at, 2)
  return value
}

export function parseLinkArgs(argv: readonly string[], usage: string): LinkArgs {
  const args = [...argv]
  const host = takeFlag(args, '--host', usage) ?? 'user'
  const next = takeFlag(args, '--next', usage)
  if (args.length !== 1) throw new QaGuardError(`Usage: ${usage}`)
  if (!(host in QA_HOSTS)) throw new QaGuardError(`--host must be one of ${Object.keys(QA_HOSTS).join(', ')}, not ${host}.`)
  const email = args[0].trim().toLowerCase()
  if (!EMAIL.test(email)) throw new QaGuardError(`Not an email address: ${args[0]}`)
  if (next !== undefined && sanitizeNext(next) !== next) {
    throw new QaGuardError(`--next must be a same-site path like /photos, not ${next}`)
  }
  return { email, host: host as QaHost, next }
}

// QA personas have their own reset/login path; signing them in here would bypass its rules.
export function assertNotPersona(email: string): void {
  const persona = Object.values(PERSONAS).find((p) => p.email === email)
  if (persona) throw new QaGuardError(`${email} is the ${persona.id} persona; use pnpm qa:login ${persona.id}.`)
}

// The page the sign-up form would have sent the visitor to: --next if given, otherwise the
// account page in the account's own language, as sign-up.ts does for a form without `next`.
export function landingPath(next: string | undefined, locale: unknown): string {
  if (next !== undefined) return next
  return nextIn(DEFAULT_AFTER_LOGIN, isLocale(locale) ? locale : 'en')
}

// Exactly what supabase/templates/confirm-signup.html renders:
//   printf "%s&token_hash=%s&type=signup" .RedirectTo .TokenHash
// where RedirectTo is the app's confirmUrl(next, origin) and TokenHash is the stored
// auth.users.confirmation_token (it carries the pkce_ prefix when there is one).
export function buildConfirmLink(host: QaHost, tokenHash: string, next: string): string {
  if (!TOKEN_HASH.test(tokenHash)) throw new QaGuardError('The stored confirmation token has an unexpected shape.')
  return `${confirmUrl(next, QA_HOSTS[host])}&token_hash=${tokenHash}&type=signup`
}

export type PendingSignup = {
  email_confirmed_at: Date | string | null
  confirmation_token: string | null
  confirmation_sent_at: Date | string | null
}

// Supabase's longest email-link lifetime (otp_expiry, at most 86400 s); the 2021 referral row
// is refused after the same day.
const MAX_LINK_AGE_MS = 24 * 60 * 60 * 1000

export function assertPending(row: PendingSignup | undefined, email: string, now = Date.now()): string {
  if (!row) throw new QaGuardError(`No account for ${email} on the test project.`)
  if (row.email_confirmed_at) throw new QaGuardError(`${email} is already confirmed; use pnpm qa:login-email ${email}.`)
  if (!row.confirmation_token) throw new QaGuardError(`${email} has no pending confirmation email.`)
  const sent = row.confirmation_sent_at ? new Date(row.confirmation_sent_at).getTime() : NaN
  if (!Number.isFinite(sent)) throw new QaGuardError(`${email} has no confirmation_sent_at; its link cannot be trusted.`)
  if (now - sent > MAX_LINK_AGE_MS) {
    throw new QaGuardError(`${email}'s confirmation email is older than a day; its link has expired. Sign up again.`)
  }
  return row.confirmation_token
}

// QA_TEST_DB_URL must be the test project's Postgres: the direct host db.<ref>.supabase.co, or
// a Supabase pooler (*.pooler.supabase.com) with the user postgres.<ref>. Checked before any
// connection is made; the URL (it holds the password) is never echoed.
export function assertTestDbUrl(raw: string | undefined): string {
  if (!raw) throw new QaGuardError('QA_TEST_DB_URL is missing from .env.local; see scripts/qa/README.md (confirm links).')
  for (const ref of PRODUCTION_REFS) {
    if (raw.includes(ref)) throw new QaGuardError('QA_TEST_DB_URL points at production; refusing.')
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new QaGuardError('QA_TEST_DB_URL is not a URL.')
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new QaGuardError('QA_TEST_DB_URL must be a postgresql:// connection string.')
  }
  const user = decodeURIComponent(url.username)
  const direct = url.hostname === `db.${PREVIEW_REF}.supabase.co` && user === 'postgres'
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && user === `postgres.${PREVIEW_REF}`
  if (!direct && !pooler) {
    throw new QaGuardError(`QA_TEST_DB_URL is not the test project (${PREVIEW_REF}): host ${url.hostname}.`)
  }
  // TLS is set by the script itself; a sslmode in the string would override it.
  url.searchParams.delete('sslmode')
  return url.toString()
}
