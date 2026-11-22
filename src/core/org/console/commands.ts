import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { allocateOrgCredits, depositOrgCredits, joinOrg, leaveOrg, removeOrgMember, rotateOrgInvite, setOrgAllowance } from '../actions'
import { bulkGrantOrgCredits, bulkSetOrgAllowance, setOrgDefaultAllowances } from '../bulk-actions'
import { allocateOrgPromoCredits, setOrgPromoAllowance } from '../promo-actions'
import type { ConsoleError, ConsoleResult } from './types'

// Server-side commands of the account centre's enterprise block. The signed-in account's id comes
// from the server session (`user`), never from the form; each owner command checks the caller
// really owns an org before it calls the SQL function, which checks it again. Forms send plain
// values; amounts are parsed here, and a request id made by the form (stable across double clicks
// and retries) is namespaced with the org so two orgs can never collide on one id.

export type Deps = { db: SupabaseClient; user: string }

const formId = z.string().trim().min(8).max(100)
const credits = z.coerce.number().int().positive().max(1_000_000_000)
const uuid = z.uuid()

// SQL exception text (kept on AppError.message by callRpc) → what the page says.
const BY_MESSAGE: Record<string, ConsoleError> = {
  NOT_ORG_OWNER: 'NOT_OWNER',
  ORG_SUSPENDED: 'SUSPENDED',
  ORG_POOL_INSUFFICIENT: 'POOL_INSUFFICIENT',
  CREDITS_INSUFFICIENT: 'CREDITS_INSUFFICIENT',
  ORG_MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  ORG_OWNER_CANNOT_LEAVE: 'OWNER_CANNOT_LEAVE',
  ORG_INVITE_INVALID: 'INVITE_INVALID',
  ORG_MEMBER_EXISTS: 'ALREADY_IN_ORG',
  ORG_PERSONAL_AFFILIATE: 'PERSONAL_AFFILIATE',
  ORG_PERSONAL_AFFILIATE_UNSETTLED: 'PERSONAL_AFFILIATE_UNSETTLED',
  USER_BANNED: 'BANNED',
  INVALID_INPUT: 'INVALID',
  IDEMPOTENCY_CONFLICT: 'CONFLICT',
}

export function consoleError(error: unknown): ConsoleError {
  if (error instanceof z.ZodError) return 'INVALID'
  if (error instanceof AppError) {
    const known = BY_MESSAGE[error.message]
    if (known) return known
    if (error.code === 'INTERNAL') logger.error('org console action failed', { code: error.code })
  } else {
    logger.error('org console action failed')
  }
  return 'FAILED'
}

async function run<T>(work: () => Promise<T>): Promise<ConsoleResult<T extends object ? T : Record<never, never>>> {
  try {
    return { ok: true, ...((await work()) ?? {}) } as ConsoleResult<T extends object ? T : Record<never, never>>
  } catch (error) {
    return { ok: false, error: consoleError(error) }
  }
}

// The org this account owns, from the database (never from the request). Anyone else is NOT_OWNER.
async function ownedOrg({ db, user }: Deps): Promise<string> {
  const { data, error } = await db.from('orgs').select('id').eq('owner_user_id', user).maybeSingle()
  if (error) throw new AppError('INTERNAL', 'org owner lookup failed', { cause: new Error(error.message) })
  if (!data) throw new AppError('FORBIDDEN', 'NOT_ORG_OWNER')
  return z.object({ id: uuid }).parse(data).id
}

const requestFor = (org: string, kind: string, id: string) => `console:${kind}:${org}:${formId.parse(id)}`

export const allocateInput = z.object({ requestId: formId, member: uuid, credits })
export const allowanceInput = z.object({ member: uuid, allowance: z.coerce.number().int().min(0).max(1_000_000_000) })
export const depositInput = z.object({ requestId: formId, credits })
export const removeInput = z.object({ requestId: formId, member: uuid })
export const leaveInput = z.object({ requestId: formId })

export const allocate = (d: Deps, input: unknown) => run(async () => {
  const form = allocateInput.parse(input)
  const org = await ownedOrg(d)
  const moved = await allocateOrgCredits(d.db, d.user, form.member, form.credits, requestFor(org, 'allocate', form.requestId))
  return { pool: moved.pool_credits }
})

export const setAllowance = (d: Deps, input: unknown) => run(async () => {
  const form = allowanceInput.parse(input)
  await ownedOrg(d)
  return { allowance: await setOrgAllowance(d.db, d.user, form.member, form.allowance) }
})

// The promotion pool (migration 1893): the same forms, the other pool. Request ids are namespaced
// by kind too, so a paid and a promotion give can never share one.
export const allocatePromo = (d: Deps, input: unknown) => run(async () => {
  const form = allocateInput.parse(input)
  const org = await ownedOrg(d)
  const moved = await allocateOrgPromoCredits(d.db, d.user, form.member, form.credits, requestFor(org, 'allocate_promo', form.requestId))
  return { pool: moved.promo_pool_credits }
})

export const setPromoAllowance = (d: Deps, input: unknown) => run(async () => {
  const form = allowanceInput.parse(input)
  await ownedOrg(d)
  return { allowance: await setOrgPromoAllowance(d.db, d.user, form.member, form.allowance) }
})

// Defaults and bulk actions (migration 1899): one request id per form, namespaced like the rest.
export const defaultsInput = z.object({ requestId: formId, paid: z.coerce.number().int().min(0).max(1_000_000_000).optional(), promo: z.coerce.number().int().min(0).max(1_000_000_000).optional() })
const bulkValue = z.union([z.literal('default'), z.coerce.number().int().min(0).max(1_000_000_000)]).optional()
export const bulkSetInput = z.object({ requestId: formId, members: z.array(uuid).min(1).max(200), paid: bulkValue, promo: bulkValue })
export const bulkGrantInput = z.object({ requestId: formId, members: z.array(uuid).min(1).max(200), kind: z.enum(['paid', 'promo']), each: credits })

export const setDefaults = (d: Deps, input: unknown) => run(async () => {
  const { requestId, ...values } = defaultsInput.parse(input)
  const org = await ownedOrg(d)
  const saved = await setOrgDefaultAllowances(d.db, d.user, values, requestFor(org, 'defaults', requestId))
  return { paid: saved.default_paid_allowance, promo: saved.default_promo_allowance }
})

export const bulkSetAllowance = (d: Deps, input: unknown) => run(async () => {
  const { requestId, ...values } = bulkSetInput.parse(input)
  const org = await ownedOrg(d)
  return { members: (await bulkSetOrgAllowance(d.db, d.user, values, requestFor(org, 'bulk_set', requestId))).members }
})

export const bulkGrant = (d: Deps, input: unknown) => run(async () => {
  const { requestId, ...values } = bulkGrantInput.parse(input)
  const org = await ownedOrg(d)
  const done = await bulkGrantOrgCredits(d.db, d.user, values, requestFor(org, 'bulk_grant', requestId))
  return { members: done.members, total: done.total, pool: done.pool_credits }
})

export const deposit = (d: Deps, input: unknown) => run(async () => {
  const form = depositInput.parse(input)
  const org = await ownedOrg(d)
  const moved = await depositOrgCredits(d.db, d.user, form.credits, requestFor(org, 'deposit', form.requestId))
  return { pool: moved.pool_credits }
})

export const removeMember = (d: Deps, input: unknown) => run(async () => {
  const form = removeInput.parse(input)
  const org = await ownedOrg(d)
  return { reclaimed: await removeOrgMember(d.db, d.user, form.member, requestFor(org, 'remove', form.requestId)) }
})

export const resetInvite = (d: Deps) => run(async () => {
  await ownedOrg(d)
  return { token: await rotateOrgInvite(d.db, d.user) }
})

// A member leaves their org; the owner cannot (the SQL says OWNER_CANNOT_LEAVE).
export const leave = (d: Deps, input: unknown) => run(async () => {
  const form = leaveInput.parse(input)
  return { reclaimed: await leaveOrg(d.db, d.user, `console:leave:${d.user}:${form.requestId}`) }
})

export const join = (d: Deps, token: string) => run(async () => {
  await joinOrg(d.db, d.user, token)
})
