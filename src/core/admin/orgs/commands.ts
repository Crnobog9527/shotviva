import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import {
  adminCreateOrg, adminGrantOrg, adminSaveOrgPackage, adminSavePaymentAccount, adminSetOrgSignupBonus, adminUpdateOrg,
  ORG_SIGNUP_BONUS_MAX, PAYMENT_FIELDS, PAYMENT_KINDS,
} from '@/core/org'
import { EnrollmentError, phoneUser } from '@/core/affiliate/admin/create-account'
import { findUser } from '@/core/affiliate/admin/summary'
import { toAppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { ORGS_COPY as COPY, USAGE_FIELDS, type UsageField } from './copy'
import { loadOrgDetail } from './reads'
import type { LimitCaps, OrgActionResult, OrgRow } from './types'

// Server-side commands of /admin/orgs. They only call the E1 SQL functions (core/org); the
// functions check the actor is an unbanned admin and write the audit log. Forms send text, so
// numbers and money are parsed here, never trusted from the browser.

export class OrgInputError extends Error {}

export type OrgDeps = { db: SupabaseClient; actor: string }

const WHOLE = /^\d{1,12}$/
const MONEY = /^\d{1,12}(?:\.\d{1,2})?$/

function wholeNumber(raw: string, label: string): number {
  const value = raw.trim()
  if (!WHOLE.test(value)) throw new OrgInputError(COPY.numberField(label))
  return Number(value)
}

function optionalWhole(raw: string, label: string): number | null {
  return raw.trim() === '' ? null : wholeNumber(raw, label)
}

// "1234.5" -> 123450 (cents or fen), no floating point.
export function moneyToMinor(raw: string, label: string): number {
  const value = raw.trim()
  if (!MONEY.test(value)) throw new OrgInputError(COPY.moneyField(label))
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

const text = (max: number) => z.string().max(max)
const idSchema = z.uuid()

const createSchema = z.object({ name: z.string().trim().min(1).max(120), account: z.string().trim().min(1).max(254), note: text(2000).default('') })

// The owner must already have an account: an email is looked up exactly (never invited), a phone
// goes through the same matching as affiliate enrolment.
async function resolveOwner({ db, actor }: OrgDeps, account: string): Promise<string> {
  if (!account.includes('@') && !idSchema.safeParse(account).success) return phoneUser(db, account)
  const found = await findUser(db, actor, account.includes('@') ? account.toLowerCase() : account)
  if (!found) throw new OrgInputError(COPY.noAccount)
  return found.user_id
}

export async function createOrg(deps: OrgDeps, input: unknown): Promise<OrgActionResult<{ id: string }>> {
  const parsed = createSchema.parse(input)
  const ownerId = await resolveOwner(deps, parsed.account)
  const id = await adminCreateOrg(deps.db, deps.actor, {
    owner_user_id: ownerId,
    name: parsed.name,
    ...(parsed.note.trim() ? { admin_note: parsed.note } : {}),
  })
  return { ok: true, message: COPY.created, value: { id } }
}

const saveSchema = z.object({
  id: idSchema,
  expectedUpdatedAt: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  status: z.enum(['active', 'suspended']),
  note: text(2000),
  concurrency: text(20),
  per_window: text(20),
  batch_max: text(20),
  multi_template_max: text(20),
  batchZip: z.boolean(),
  earlyFeatures: z.boolean(),
  affiliateEnabled: z.boolean(),
  affiliateLevels: z.union([z.literal(1), z.literal(2)]),
  rotateInvite: z.boolean(),
})

// Usage keys the admin changed, checked against the hard cap. Only these are sent: the SQL checks
// each key present, so an untouched value saved under an older, higher cap never blocks an edit
// of the name.
function changedUsage(form: z.infer<typeof saveSchema>, org: OrgRow, caps: LimitCaps): Partial<Record<UsageField, number | null>> {
  const current: Record<UsageField, number | null> = {
    concurrency: org.concurrency, per_window: org.perWindow, batch_max: org.batchMax, multi_template_max: org.multiTemplateMax,
  }
  const usage: Partial<Record<UsageField, number | null>> = {}
  for (const { key, label } of USAGE_FIELDS) {
    const value = optionalWhole(form[key], label)
    if (value === current[key]) continue
    if (value !== null) {
      const cap = caps[key]
      if (cap === undefined || value > cap) throw new OrgInputError(COPY.aboveCap(label, cap ?? 0))
      if (value < (key === 'multi_template_max' ? 0 : 1)) throw new OrgInputError(COPY.numberField(label))
    }
    usage[key] = value
  }
  return usage
}

export async function saveOrg(deps: OrgDeps, input: unknown): Promise<OrgActionResult<{ updatedAt: string }>> {
  const form = saveSchema.parse(input)
  const detail = await loadOrgDetail(deps.db, form.id)
  if (!detail) throw new OrgInputError(COPY.notFound)
  const updatedAt = await adminUpdateOrg(deps.db, deps.actor, form.id, {
    expected_updated_at: form.expectedUpdatedAt,
    name: form.name,
    status: form.status,
    admin_note: form.note.trim() === '' ? null : form.note,
    batch_zip: form.batchZip,
    early_features: form.earlyFeatures,
    affiliate_enabled: form.affiliateEnabled,
    affiliate_levels: form.affiliateLevels,
    ...(form.rotateInvite ? { rotate_invite: true } : {}),
    ...changedUsage(form, detail.org, detail.caps),
  })
  return { ok: true, message: COPY.saved, value: { updatedAt } }
}

const bonusSchema = z.object({ id: idSchema, expectedUpdatedAt: z.string().min(1), credits: text(20) })

// Extra free credits for the org's new level-1 customers (1690). Empty means 0 (off).
export async function saveSignupBonus(deps: OrgDeps, input: unknown): Promise<OrgActionResult<{ updatedAt: string }>> {
  const form = bonusSchema.parse(input)
  const credits = form.credits.trim() === '' ? 0 : wholeNumber(form.credits, COPY.bonusLabel)
  if (credits > ORG_SIGNUP_BONUS_MAX) throw new OrgInputError(COPY.bonusAbove(ORG_SIGNUP_BONUS_MAX))
  const updatedAt = await adminSetOrgSignupBonus(deps.db, deps.actor, form.id, credits, form.expectedUpdatedAt)
  return { ok: true, message: COPY.bonusSaved, value: { updatedAt } }
}

const grantSchema = z.object({
  orgId: idSchema,
  requestId: z.string().trim().min(8).max(100),
  kind: z.enum(['bank_grant', 'admin_adjust']),
  packageId: z.union([idSchema, z.literal('')]),
  credits: text(20),
  cny: text(20),
  reference: text(200),
  note: text(2000),
})

type GrantArgs = Parameters<typeof adminGrantOrg>[2]

type GrantForm = z.infer<typeof grantSchema>

function grantBase(form: GrantForm) {
  return {
    org_id: form.orgId,
    request_id: `admin_grant:${form.requestId}`,
    ...(form.packageId ? { package_id: form.packageId } : {}),
    ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
  }
}

function adjustArgs(form: GrantForm): GrantArgs {
  if (!/^-?\d{1,12}$/.test(form.credits.trim()) || Number(form.credits) === 0 || !form.note.trim()) throw new OrgInputError(COPY.invalid)
  return { ...grantBase(form), kind: 'admin_adjust', credits: Number(form.credits), note: form.note.trim() }
}

function bankArgs(form: GrantForm): GrantArgs {
  const credits = optionalWhole(form.credits, COPY.credits)
  if (credits === null && !form.packageId) throw new OrgInputError(COPY.numberField(COPY.credits))
  return {
    ...grantBase(form), kind: 'bank_grant',
    ...(credits === null ? {} : { credits }),
    ...(form.cny.trim() === '' ? {} : { amount_cny_fen: moneyToMinor(form.cny, COPY.receivedCny) }),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  }
}

function grantArgs(form: GrantForm): GrantArgs {
  return form.kind === 'admin_adjust' ? adjustArgs(form) : bankArgs(form)
}

// The request id is minted once per open form in the browser: a double click or a retry after a
// dropped response sends the same id, and admin_org_grant applies it once.
export async function grantOrg(deps: OrgDeps, input: unknown): Promise<OrgActionResult<{ pool: number }>> {
  const result = await adminGrantOrg(deps.db, deps.actor, grantArgs(grantSchema.parse(input)))
  return { ok: true, message: `${result.applied ? COPY.granted : COPY.grantRepeat} ${result.pool_credits}`, value: { pool: result.pool_credits } }
}

const packageSchema = z.object({
  id: z.union([idSchema, z.literal('')]),
  expectedUpdatedAt: z.string(),
  name: z.string().trim().min(1).max(80),
  priceUsd: text(20),
  credits: text(20),
  sort: text(10),
  active: z.boolean(),
})

export async function savePackage(deps: OrgDeps, input: unknown): Promise<OrgActionResult> {
  const form = packageSchema.parse(input)
  const price = moneyToMinor(form.priceUsd, COPY.priceUsd)
  const credits = wholeNumber(form.credits, COPY.packageCredits)
  const sort = form.sort.trim() === '' ? 0 : wholeNumber(form.sort, COPY.sort)
  if (price < 1 || credits < 1 || sort > 1000) throw new OrgInputError(COPY.invalid)
  await adminSaveOrgPackage(deps.db, deps.actor, {
    ...(form.id ? { id: form.id, expected_updated_at: form.expectedUpdatedAt } : {}),
    name: form.name, price_usd_cents: price, credits, sort, active: form.active,
  })
  return { ok: true, message: COPY.packageSaved }
}

const paymentSchema = z.object({
  kind: z.enum(PAYMENT_KINDS),
  enabled: z.boolean(),
  expectedUpdatedAt: text(40),
  fields: z.record(z.string(), text(1000)),
})

// Only the fields of the chosen group are sent; the SQL refuses anything else.
export async function savePaymentAccount(deps: OrgDeps, input: unknown): Promise<OrgActionResult<{ updatedAt: string }>> {
  const form = paymentSchema.parse(input)
  const details = Object.fromEntries(PAYMENT_FIELDS[form.kind].map((key) => [key, form.fields[key] ?? '']))
  const filled = (key: string) => (details[key] ?? '').trim() !== ''
  if (form.enabled && !['account_name', 'bank_name', 'account_number'].every(filled)) throw new OrgInputError(COPY.payRequired)
  const updatedAt = await adminSavePaymentAccount(deps.db, deps.actor, {
    kind: form.kind, enabled: form.enabled, details,
    ...(form.expectedUpdatedAt ? { expected_updated_at: form.expectedUpdatedAt } : {}),
  })
  return { ok: true, message: COPY.paySaved, value: { updatedAt } }
}

const KNOWN: Record<string, string> = {
  ORG_CHANGED: COPY.changed,
  ORG_MEMBER_EXISTS: COPY.exists,
  ORG_NOT_FOUND: COPY.notFound,
  ORG_PACKAGE_NOT_FOUND: COPY.packageMissing,
  ORG_POOL_INSUFFICIENT: COPY.poolShort,
  IDEMPOTENCY_CONFLICT: COPY.conflict,
  PROFILE_NOT_FOUND: COPY.noAccount,
  INVALID_INPUT: COPY.invalid,
  ORG_LIMIT_ABOVE_CAP: COPY.aboveCapGeneric,
}

// Turns anything thrown into the message the form shows; unknown failures are logged, not shown.
export function orgFailure(error: unknown): { ok: false; message: string } {
  if (error instanceof OrgInputError || error instanceof EnrollmentError) return { ok: false, message: error.message }
  if (error instanceof z.ZodError) return { ok: false, message: COPY.invalid }
  const app = toAppError(error)
  const known = KNOWN[app.message]
  if (known) return { ok: false, message: known }
  if (app.code === 'FORBIDDEN') return { ok: false, message: COPY.forbidden }
  logger.error('admin.orgs.action.failed', { error: app.cause ?? app })
  return { ok: false, message: COPY.failed }
}

export async function runOrgAction<T>(work: () => Promise<OrgActionResult<T>>): Promise<OrgActionResult<T>> {
  try {
    return await work()
  } catch (error) {
    return orgFailure(error)
  }
}
