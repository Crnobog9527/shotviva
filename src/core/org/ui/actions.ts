import type { ConsoleResult } from '../console/types'

// The server actions the enterprise block calls; app/ passes them in (core never imports app/).
export type OwnerActions = {
  deposit: (input: { requestId: string; credits: number }) => Promise<ConsoleResult<{ pool: number }>>
  allocate: (input: { requestId: string; member: string; credits: number }) => Promise<ConsoleResult<{ pool: number }>>
  setAllowance: (input: { member: string; allowance: number }) => Promise<ConsoleResult<{ allowance: number }>>
  removeMember: (input: { requestId: string; member: string }) => Promise<ConsoleResult<{ reclaimed: number }>>
  resetInvite: () => Promise<ConsoleResult<{ token: string }>>
}

export type StaffActions = {
  leave: (input: { requestId: string }) => Promise<ConsoleResult<{ reclaimed: number }>>
}

export type JoinAction = () => Promise<ConsoleResult>
