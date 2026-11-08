import type { Page } from '../cursor'
import type { LedgerEntry, UserDetail, UserJob } from './types'

// Shapes of the T25 user detail blocks (ARCHITECTURE §10「用户详情补全」). Money is in the
// currency's minor unit, as Stripe and payments store it.

export type UserPayment = {
  id: string
  createdAt: string
  productId: string
  channel: 'stripe' | 'waffo'
  providerId: string | null
  chargeId: string | null
  amountTotal: number
  amountTax: number
  amountRefunded: number
  currency: string
  method: string
  status: string
  // T71: credits taken back for this payment, and those already spent (「欠扣」).
  creditsClawedBack: number
  clawbackShortfall: number
}

export type UserSubscription = {
  // current_tier(): 'pro' | 'max' | … or null when the membership period is over.
  tier: string | null
  subscriptions: { id: string; productId: string; status: string; periodEnd: string; cancelAtPeriodEnd: boolean }[]
}

export type GraylumLink = { connected: boolean; linkedAt: string | null; revokedAt: string | null }

export type SameIpAccount = { id: string; createdAt: string; freeCredits: number; bannedAt: string | null }

export type UserRequest = { id: string; createdAt: string; status: string; description: string; votes: number }

export type UserExtras = {
  signupIp: string | null
  payments: UserPayment[]
  subscription: UserSubscription
  graylum: GraylumLink | null
  sameIp: SameIpAccount[]
  requests: UserRequest[]
  // Face-swap refusals (ARCHITECTURE §5.1a, T81): over the 90 days kept and the last 24 hours.
  identityRefusals: { total: number; last24h: number; flagged: boolean }
}

export const DETAIL_ROWS = 10
// Same-IP accounts shown on the detail page; a bigger cluster belongs in 「可疑注册」.
export const SAME_IP_ROWS = 20

// Everything the user detail dialog shows (T77), as a server action hands it over.
export type UserDetailData = {
  user: UserDetail
  jobs: UserJob[]
  ledger: Page<LedgerEntry>
  // Whether `ledger` is a later page (the dialog offers a way back to the first).
  ledgerPaged: boolean
  extras: UserExtras
}
