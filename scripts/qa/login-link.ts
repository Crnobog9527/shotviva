import { DEFAULT_AFTER_LOGIN, sanitizeNext } from '../../src/core/auth/redirect-target'

// Same shape /auth/confirm accepts (core/auth/flows/confirm-params.ts).
const TOKEN_HASH = /^[A-Za-z0-9_-]{8,256}$/

export class LoginLinkError extends Error {}

// A --next the app would rewrite is refused here instead of silently landing elsewhere.
export function checkNext(next: string | undefined): string {
  if (next === undefined) return DEFAULT_AFTER_LOGIN
  if (sanitizeNext(next) !== next) throw new LoginLinkError(`--next must be a same-site path like /photos, not ${next}`)
  return next
}

// The existing email-link landing (no new route): the site verifies the token hash
// server-side, sets the session cookie and redirects to `next`.
export function buildLoginUrl(siteOrigin: string, tokenHash: string, next: string): string {
  if (!TOKEN_HASH.test(tokenHash)) throw new LoginLinkError('generateLink returned an unexpected token hash.')
  const url = new URL('/auth/confirm', siteOrigin)
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', 'magiclink')
  url.searchParams.set('next', checkNext(next))
  return url.toString()
}

export function parseLoginArgs(argv: string[]): { persona: string; next: string | undefined } {
  const args = [...argv]
  let next: string | undefined
  const at = args.indexOf('--next')
  if (at !== -1) {
    next = args[at + 1]
    if (next === undefined || next.startsWith('--')) throw new LoginLinkError('--next needs a path, e.g. --next /photos')
    args.splice(at, 2)
  }
  if (args.length !== 1) throw new LoginLinkError('Usage: pnpm qa:login <persona> [--next /path]')
  return { persona: args[0], next }
}
