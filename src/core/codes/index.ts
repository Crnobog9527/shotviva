export const CODE_COOKIE = 'sv_code'
export const codeCookieOptions = { path: '/', maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure: true } as const

const codeInput = /^[A-Za-z0-9]{4,20}$/
export function normalizeCode(input: unknown): string | null {
  return typeof input === 'string' && codeInput.test(input) ? input.toUpperCase() : null
}

export { discountedPriceCents, percentZh } from './discount'

export type InviteConfig = {
  windowDays: number
  inviterRewardCap: number
}

export type PendingDiscount = NonNullable<Awaited<ReturnType<typeof import('./read').readPendingDiscount>>>

export { inviteRewards, MAX_INVITE_REWARD, type InviteRewards } from './invite-rewards'
