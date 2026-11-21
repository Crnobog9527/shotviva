import type { UsageField } from './copy'

export type OrgStatus = 'active' | 'suspended'

export type OrgRow = {
  id: string
  name: string
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
}

// Serialisable answer of an org server action; the page shows `message`.
export type OrgActionResult<T = undefined> =
  | { ok: true; message: string; value?: T }
  | { ok: false; message: string }
