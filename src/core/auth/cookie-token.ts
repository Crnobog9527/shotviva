import { combineChunks, stringFromBase64URL } from '@supabase/ssr'

// The access token in the request's Supabase session cookie, read without the SDK: asking the
// SDK (getSession) refreshes a token that is expired or near expiry, and outside the proxy a
// refresh rotates the refresh token server-side while a Server Component cannot write the new
// cookies, so the browser keeps the used one and is signed out after Auth's reuse window.
// Refreshing is the proxy's job alone (identity.ts).
type Cookie = { name: string; value: string }

// auth-js's default storage key, which @supabase/ssr writes as the cookie name (split into
// `.0`, `.1` … chunks when long): sb-<first label of the Supabase host>-auth-token.
export function sessionCookieName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
}

const BASE64_PREFIX = 'base64-'

export type CookieToken = { token: string; expiresAt: number } | null

function decode(raw: string): CookieToken {
  try {
    const json = raw.startsWith(BASE64_PREFIX) ? stringFromBase64URL(raw.slice(BASE64_PREFIX.length)) : raw
    const session: unknown = JSON.parse(json)
    if (typeof session !== 'object' || session === null) return null
    const { access_token: token } = session as { access_token?: unknown }
    if (typeof token !== 'string' || !token) return null
    // exp from the JWT itself, the value getClaims() checks; the cookie's own expires_at can lag.
    const payload: unknown = JSON.parse(stringFromBase64URL(token.split('.')[1] ?? ''))
    const exp = (payload as { exp?: unknown } | null)?.exp
    return typeof exp === 'number' ? { token, expiresAt: exp * 1000 } : null
  } catch {
    return null
  }
}

// null: no session cookie, or one we cannot read (treated as signed out, as the SDK would).
export async function cookieToken(cookies: readonly Cookie[], supabaseUrl: string): Promise<CookieToken> {
  const name = sessionCookieName(supabaseUrl)
  const raw = await combineChunks(name, (chunk) => cookies.find((cookie) => cookie.name === chunk)?.value ?? null)
  return raw ? decode(raw) : null
}
