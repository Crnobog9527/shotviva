// Shared helpers: sign-in through local GoTrue and the @supabase/ssr session cookie.
import encoding from 'k6/encoding'
import http from 'k6/http'

export const BASE = __ENV.BASE_URL || 'http://localhost:3100'
export const SUPABASE = __ENV.SUPABASE_URL || 'http://127.0.0.1:54321'
export const ANON_KEY = __ENV.SUPABASE_ANON_KEY
// Local targets only: the scripts sign in seeded accounts and drive real writes.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/
for (const [name, url] of [['BASE_URL', BASE], ['SUPABASE_URL', SUPABASE]]) {
  if (!LOCAL.test(url)) throw new Error(`${name} must be http(s)://localhost or 127.0.0.1, got ${url}`)
}
const PASSWORD = 'loadtest-password'
const CHUNK = 3180

// The cookie @supabase/ssr reads: sb-<first host label>-auth-token, "base64-" + base64url(JSON),
// split into .0/.1… past 3180 characters.
export function sessionCookies(session) {
  // No URL global in k6: the host is between :// and the next : or /.
  const ref = SUPABASE.replace(/^[a-z]+:\/\//, '').split(/[:/]/)[0].split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + encoding.b64encode(JSON.stringify(session), 'rawurl')
  if (value.length <= CHUNK) return { [name]: value }
  const out = {}
  for (let i = 0; i * CHUNK < value.length; i++) out[`${name}.${i}`] = value.slice(i * CHUNK, (i + 1) * CHUNK)
  return out
}

export function signIn(n) {
  const res = http.post(`${SUPABASE}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: `loadtest-${n}@example.test`, password: PASSWORD }),
    { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, tags: { name: 'auth.signin' } })
  if (res.status !== 200) throw new Error(`sign-in ${n} failed: ${res.status} ${res.body}`)
  return sessionCookies(res.json())
}

export function cookieHeader(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

// 10 → 50 → 100 → 300 concurrent users, each level held so p95 settles.
export function ramp(hold = __ENV.HOLD || '60s', step = __ENV.STEP || '20s') {
  const levels = (__ENV.LEVELS || '10,50,100,300').split(',').map(Number)
  return levels.flatMap((target) => [{ duration: step, target }, { duration: hold, target }]).concat([{ duration: '10s', target: 0 }])
}
