export const CODE_COOKIE = 'sv_code'
export const codeCookieOptions = { path: '/', maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', secure: true } as const

const codeInput = /^[A-Za-z0-9]{4,20}$/
export function normalizeCode(input: unknown): string | null {
  return typeof input === 'string' && codeInput.test(input) ? input.toUpperCase() : null
}

// Chinese discount names express the fraction paid. 25% off is 七五折.
export function percentZh(percent: number): string {
  const paid = 100 - percent
  return `${paid % 10 === 0 ? paid / 10 : paid} 折`
}

// One USD line item, quantity one. Round the discount to cents before subtracting it.
export function discountedPriceCents(priceCents: number, percent: number): number {
  const subtotal = BigInt(priceCents)
  const discount = (subtotal * BigInt(percent) + BigInt(50)) / BigInt(100)
  return Number(subtotal - discount)
}

export type InviteConfig = {
  inviteeCredits: number
  inviterCredits: number
  windowDays: number
  inviterRewardCap: number
}

export type PendingDiscount = NonNullable<Awaited<ReturnType<typeof import('./read').readPendingDiscount>>>

export { inviteRewards, MAX_INVITE_REWARD, type InviteRewards } from './invite-rewards'
