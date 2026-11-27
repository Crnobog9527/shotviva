import type { UsageField } from './copy'

export type OrgStatus = 'active' | 'suspended'

export type OrgRow = {
  id: string
  name: string
  // Enterprise number for bank-transfer references (SV-XXXXXX); fixed at creation.
  refCode: string
  ownerUserId: string
  status: OrgStatus
  concurrency: number | null
  perWindow: number | null
  batchMax: number | null
  multiTemplateMax: number | null
  batchZip: boolean
  earlyFeatures: boolean
  affiliateEnabled: boolean
  affiliateLevels: 1 | 2
  // Extra free credits for a new level-1 customer of the org (0 = off).
  signupBonusCredits: number
  poolCredits: number
  adminNote: string | null
  createdAt: string
  updatedAt: string
}

export type OrgListItem = OrgRow & { ownerAccount: string | null; memberCount: number }

export type OrgPackage = {
  id: string
  name: string
  priceUsdCents: number
  credits: number
  active: boolean
  sort: number
  updatedAt: string
}

export type LedgerRow = {
  id: number
  kind: string
  delta: number
  poolAfter: number
  memberAccount: string | null
  packageName: string | null
  amountCnyFen: number | null
  reference: string | null
  note: string | null
  createdAt: string
}

export type MemberRow = {
  userId: string
  account: string | null
  role: 'owner' | 'member'
  monthlyAllowance: number
  heldCredits: number
  status: 'active' | 'removed'
  joinedAt: string
}

export type LimitCaps = Partial<Record<UsageField, number>>

export type OrgDetail = {
  org: OrgRow
  ownerAccount: string | null
  members: MemberRow[]
  memberTotal: number
  ledger: LedgerRow[]
  packages: OrgPackage[]
  caps: LimitCaps
  affiliate: OrgAffiliate | null
  // Users who have received the org's signup bonus so far.
  signupBonusUsers: number
}

// Serialisable answer of an org server action; the page shows `message`.
export type OrgActionResult<T = undefined> =
  | { ok: true; message: string; value?: T }
  | { ok: false; message: string }

// The org's enterprise affiliate account (E2): status plus the rate per product, the override
// when one is set, otherwise the program default.
export type OrgAffiliate = {
  userId: string
  slug: string
  status: string
  rates: { productKind: string; l1Bp: number; l2Bp: number; overridden: boolean }[]
}

export type PaymentAccountRow = { enabled: boolean; details: Record<string, string>; updatedAt: string }

// The signup bonus of one customer: given, refused with a recorded reason, or never attempted
// (the reason inferred from how they were bound).
export type OrgCustomerBonus =
  | { kind: 'granted'; credits: number; at: string }
  | { kind: 'error'; error: string }
  | { kind: 'none'; reason: 'level2' | 'paid_before' | 'first_checkout' | 'other' | 'before_org' | 'off_at_bind' | 'affiliate_off_at_bind'
    | 'no_signup_gift' | 'unrecorded' | 'banned' | 'paid_since' | 'off_now' | 'backfill' }

// One row of 推广名单 (admin_org_customers, 2020). Money in USD cents; promo in credits.
export type OrgCustomer = {
  userId: string
  contact: string | null
  level: 1 | 2
  source: string | null
  memberUserId: string | null
  memberContact: string | null
  viaUserId: string | null
  viaContact: string | null
  signedUpAt: string
  referredAt: string | null
  bonus: OrgCustomerBonus
  paidCents: number
  commissionCents: number
  promoCredits: number
}

export type OrgCustomerPage = { rows: OrgCustomer[]; total: number; page: number; pageSize: number }

export type OrgCustomerCounts = { l1: number; l2: number }
