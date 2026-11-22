import type { PaymentKind } from '../payment-labels'
import type { MemberStats, StatsTotals } from '../stats'

// What the account centre shows about an enterprise org (ARCHITECTURE §6.5, card E4). Plain data:
// the pages read it on the server and hand it to the client components.

export type OrgStatus = 'active' | 'suspended'

export type ConsolePackage = { id: string; name: string; priceUsdCents: number; credits: number }

export type ConsoleMember = {
  userId: string
  // Email, or the masked phone of a phone-only account; read live from Auth.
  account: string | null
  role: 'owner' | 'member'
  monthlyAllowance: number
  heldCredits: number
  // The promotion side (migration 1890): this member's monthly promotion allowance and the org's
  // promotion credits still in their free pool (expire at month end).
  promoAllowance: number
  heldPromoCredits: number
  // Whether that allowance is the org default (no personal setting); the numbers above are the
  // allowance in force either way (migration 1899).
  paidFollowsDefault: boolean
  promoFollowsDefault: boolean
  // Level-1 customers this member brought (profiles.referred_member).
  customers: number
  joinedAt: string
}

// Where an enterprise pays (offline bank transfer): the enabled groups from the admin-managed
// configuration (getOrgPaymentAccounts). Labels are picked by the page from the shared label
// tables, so only the group kind and its values travel. null: the read failed.
export type PaymentAccountGroup = { kind: PaymentKind; details: Record<string, string> }

export type OwnerConsole = {
  kind: 'owner'
  org: {
    id: string; name: string; refCode: string; status: OrgStatus; poolCredits: number; affiliateEnabled: boolean; affiliateLevels: 1 | 2
    // The promotion pool (channel partner grants): balance and when it expires (null: nothing live).
    promoPoolCredits: number; promoExpiresAt: string | null
    // The default monthly allowance of each kind for members without a personal setting.
    defaultPaidAllowance: number; defaultPromoAllowance: number
  }
  inviteToken: string
  members: ConsoleMember[]
  memberTotal: number
  packages: ConsolePackage[]
  // The owner's own paid credits that are not the org's share: what a deposit may take.
  depositable: number
  paymentAccounts: PaymentAccountGroup[] | null
  // This UTC month's movements of both pools (org_pool_month); null when it could not be read.
  poolMonth: PoolMonthView | null
}

// What came into each pool this month, went out to members, came back and (promotion) expired.
export type PoolMonthView = {
  period: string
  paid: { in: number; allocated: number; reclaimed: number }
  promo: { granted: number; allocated: number; reclaimed: number; expired: number; held: number }
}

// One level of a staff member's own customers: how many they have in all, and this UTC month's
// new sign-ups, paying customers and their spend (USD cents, pre-tax, net of refunds; E5).
export type StaffLevel = { customers: number; signups: number; paying: number; paidCents: number }

export type StaffCard = {
  kind: 'member'
  orgName: string
  status: OrgStatus
  monthlyAllowance: number
  // Credits the org gave this member since the start of the UTC month (monthly top-up and hand allocations).
  allocatedThisMonth: number
  // The org's share of the member's balance that is still unspent.
  heldCredits: number
  // The same for promotion credits (free pool, watermarked, expire at month end); null when unread.
  promo: { allowance: number; held: number; allocated: number; used: number } | null
  customers: number
  // Whether the org has level 2 on (the card shows the level-2 line only then).
  withLevel2: boolean
  // 'YYYY-MM' (UTC) the figures below are for; performance is null when they could not be read.
  period: string
  performance: { l1: StaffLevel; l2: StaffLevel } | null
}

// The owner's month (card E5): one row per member with what they were given, used and brought,
// and the totals. Customer spend is USD cents, pre-tax and net of refunds (see org_member_stats).
export type ReportRow = Pick<MemberStats, 'userId' | 'role' | 'status' | 'allocated' | 'used' | 'l1' | 'l2'> & { account: string | null }
export type OwnerReport = {
  period: string
  // The months the picker may go to; null at either end of the range.
  previous: string | null
  next: string | null
  withAffiliate: boolean
  withLevel2: boolean
  rows: ReportRow[]
  totals: StatsTotals
}

export type OrgView = { kind: 'none' } | OwnerConsole | StaffCard

// Why a console action did not apply. The client turns each into words (app.org.errors).
export const CONSOLE_ERRORS = [
  'NOT_OWNER',
  'SUSPENDED',
  'POOL_INSUFFICIENT',
  'CREDITS_INSUFFICIENT',
  'MEMBER_NOT_FOUND',
  'OWNER_CANNOT_LEAVE',
  'INVITE_INVALID',
  'ALREADY_IN_ORG',
  'PERSONAL_AFFILIATE',
  'PERSONAL_AFFILIATE_UNSETTLED',
  'BANNED',
  'INVALID',
  'CONFLICT',
  'FAILED',
] as const
export type ConsoleError = (typeof CONSOLE_ERRORS)[number]

export type ConsoleResult<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: ConsoleError }
