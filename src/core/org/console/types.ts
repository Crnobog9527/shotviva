import type { PaymentKind } from '../payment-labels'

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
  org: { id: string; name: string; status: OrgStatus; poolCredits: number; affiliateEnabled: boolean; affiliateLevels: 1 | 2 }
  inviteToken: string
  members: ConsoleMember[]
  memberTotal: number
  packages: ConsolePackage[]
  // The owner's own paid credits that are not the org's share: what a deposit may take.
  depositable: number
  paymentAccounts: PaymentAccountGroup[] | null
}

export type StaffCard = {
  kind: 'member'
  orgName: string
  status: OrgStatus
  monthlyAllowance: number
  // Credits the org gave this member since the start of the UTC month (monthly top-up and hand allocations).
  allocatedThisMonth: number
  // The org's share of the member's balance that is still unspent.
  heldCredits: number
  customers: number
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
