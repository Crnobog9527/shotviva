import { z } from 'zod'

export const CODE_COOKIE = 'sv_code'
export const codeCookieOptions = { path: '/', maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure: true } as const

const codeInput = z.string().min(4).max(20).regex(/^[A-Za-z0-9]+$/)
export function normalizeCode(input: unknown): string | null {
  const parsed = codeInput.safeParse(input)
  return parsed.success ? parsed.data.toUpperCase() : null
}

// Chinese discount names express the fraction paid. 25% off is 七五折.
export function percentZh(percent: number): string {
  const paid = 100 - percent
  return `${paid % 10 === 0 ? paid / 10 : paid} 折`
}

export type InviteConfig = {
  inviteeCredits: number
  inviterCredits: number
  windowDays: number
  inviterCapPer30d: number
}
