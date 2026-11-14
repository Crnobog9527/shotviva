'use server'

import { cookies } from 'next/headers'

import { CODE_COOKIE, codeCookieOptions, normalizeCode } from '../codes'

export async function readSignupCode() {
  return normalizeCode((await cookies()).get(CODE_COOKIE)?.value)
}

// An empty or invalid edit clears the previous code. A form outside the signup flow has no
// signupCode field at all and leaves an invite carried in a link alone.
export async function saveSignupCode(value: unknown) {
  const jar = await cookies()
  const code = normalizeCode(value)
  const current = jar.get(CODE_COOKIE)?.value
  if (code && code !== current) jar.set(CODE_COOKIE, code, codeCookieOptions)
  if (!code && current) jar.delete(CODE_COOKIE)
}
