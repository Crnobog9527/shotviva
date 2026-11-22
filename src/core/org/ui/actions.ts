import type { ConsoleResult } from '../console/types'

// The server actions the enterprise block calls; app/ passes them in (core never imports app/).
export type OwnerActions = {
  deposit: (input: { requestId: string; credits: number }) => Promise<ConsoleResult<{ pool: number }>>
  allocate: (input: { requestId: string; member: string; credits: number }) => Promise<ConsoleResult<{ pool: number }>>
  setAllowance: (input: { member: string; allowance: number }) => Promise<ConsoleResult<{ allowance: number }>>
  allocatePromo: (input: { requestId: string; member: string; credits: number }) => Promise<ConsoleResult<{ pool: number }>>
  setPromoAllowance: (input: { member: string; allowance: number }) => Promise<ConsoleResult<{ allowance: number }>>
  setDefaults: (input: { requestId: string; paid?: number; promo?: number }) => Promise<ConsoleResult<{ paid: number; promo: number }>>
  bulkSetAllowance: (input: { requestId: string; members: string[]; paid?: number | 'default'; promo?: number | 'default' }) => Promise<ConsoleResult<{ members: number }>>
  bulkGrant: (input: { requestId: string; members: string[]; kind: 'paid' | 'promo'; each: number }) => Promise<ConsoleResult<{ members: number; total: number; pool: number }>>
  pools: () => Promise<ConsoleResult<{ pool: number; promoPool: number }>>
  removeMember: (input: { requestId: string; member: string }) => Promise<ConsoleResult<{ reclaimed: number }>>
  resetInvite: () => Promise<ConsoleResult<{ token: string }>>
}

export type StaffActions = {
  leave: (input: { requestId: string }) => Promise<ConsoleResult<{ reclaimed: number }>>
}

export type JoinAction = () => Promise<ConsoleResult>
