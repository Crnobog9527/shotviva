import type { JobToggle } from '../jobs/job-toggles-row'

// /admin/users data shapes (ARCHITECTURE §10). credits = paid pool, freeCredits = free pool.

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
  // Template toggles as chosen (T89), shown like 出图记录.
  toggles: JobToggle[]
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
