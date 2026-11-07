// /admin/users data shapes (ARCHITECTURE §10). credits = paid pool, freeCredits = free pool.

export type AdminUserRow = {
  id: string
  email: string | null
  // auth.users.phone, E.164 digits without '+' (phone sign-ups, T63)
  phone: string | null
  createdAt: string | null
  provider: string | null
  role: 'user' | 'admin'
  credits: number
  freeCredits: number
  paidUntil: string | null
  generationCount: number
  lastGenerationAt: string | null
  bannedAt: string | null
}

export type LedgerEntry = {
  id: string
  createdAt: string
  pool: 'free' | 'paid'
  kind: string
  delta: number
  balanceAfter: number
  reason: string
}

export type UserJob = {
  id: string
  createdAt: string
  templateId: string
  status: 'running' | 'succeeded' | 'failed'
  creditsCost: number
  creditPool: 'free' | 'paid'
  errorCode: string | null
  // The user deleted this work (T41).
  deletedByUser: boolean
}

export type UserDetail = {
  id: string
  email: string | null
  phone: string | null
  createdAt: string
  role: 'user' | 'admin'
  credits: number
  freeCredits: number
  paidUntil: string | null
  bannedAt: string | null
  signupIp: string | null
}

export const RECENT_JOBS = 10
