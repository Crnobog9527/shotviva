import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { writableSlug as slug } from './enrollment'
import { feeRuleInput } from './fee-rule-input'
import { rateInputs } from './rate-inputs'
import { checked } from './read'

const uuid = z.uuid()
const required = z.string().trim().min(1).max(2000)
const rowId = z.string().regex(/^[1-9]\d{0,17}$/)
const money = z
  .string()
  .regex(/^-?\d{1,10}(?:\.\d{1,2})?$/)
  .transform((s) => Math.round(Number(s) * 100))
const user = z.object({ user_id: uuid })
const commands = {
  allowReapply: user,
  approve: user.extend({ slug }).transform((i) => ({ ...i, status: 'active' })),
  reject: user.extend({ reason: required }).transform((i) => ({ ...i, status: 'rejected' })),
  set: user.extend({
    slug,
    status: z.enum(['active', 'suspended', 'banned']),
    parent_user_id: z.union([z.literal('').transform(() => null), uuid]),
    team_enabled: z.literal('on').optional().transform(Boolean),
    void_unconfirmed: z.literal('on').optional().transform(Boolean),
  }),
  // The suspend/restore switch sends only the status, so the slug, parent, team and rate
  // overrides stay exactly as stored; the RPC leaves every key it is not given untouched.
  membership: user.extend({ status: z.enum(['active', 'suspended']) }),
  annotate: user.extend({ admin_label: z.string().trim().max(60), admin_note: z.string().trim().max(2000) }),
  adjust: user.extend({ amount: money.refine((n) => n !== 0), reason: required, request_id: uuid }),
  release: z.object({ commission_id: rowId, decision: z.enum(['release', 'void']), reason: required }),
  rebind: user.extend({ affiliate_user_id: z.union([z.literal('').transform(() => null), uuid]), reason: required }),
  hold: z.object({ payout_id: rowId, note: required }).transform((i) => ({ ...i, status: 'held' })),
  resumePayout: z.object({ payout_id: rowId }).transform((i) => ({ ...i, status: 'due' })),
  voidPayout: z.object({ payout_id: rowId, note: required, void_mode: z.enum(['return', 'forfeit']) })
    .transform((i) => ({ ...i, status: 'void' })),
  paid: z
    .object({
      payout_id: rowId,
      expected_amount: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().safe()).optional(),
      expected_net: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().safe()).optional(),
      paid_at: z.iso.date(),
      method: required,
      paid_reference: z.string().trim().max(250),
      note: z.string().trim().max(2000),
      // Only enterprise statements send these; the database requires them there and refuses them elsewhere.
      paid_fx_cny_per_usd: z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/).optional(),
      paid_amount_cny_fen: money.refine((n) => n > 0).optional(),
    })
    .refine((i) => Boolean(i.paid_reference || i.note))
    .transform((i) => ({ ...i, status: 'paid' })),
  settings: z.object({
    hold_days: z.coerce.number().int().nonnegative(),
    commission_months: z.union([z.literal('').transform(() => null), z.coerce.number().pipe(z.int32().positive())]).optional(),
    payout_min_usd: money.refine((n) => n > 0),
    settlement_day: z.coerce.number().int().min(1).max(28),
    apply_min_level: z.enum(['none', 'any_paid', 'starter', 'pro', 'max']),
    terms_version: required,
  }),
  recompute: z.object({ payment_id: z.string().regex(/^[1-9]\d{0,17}$/) }),
}
const rpcName = {
  allowReapply: 'allow_reapply',
  approve: 'decide',
  reject: 'decide',
  set: 'set',
  membership: 'set',
  annotate: 'annotate',
  adjust: 'adjust',
  release: 'commission_release',
  rebind: 'rebind',
  hold: 'payout_decide',
  paid: 'payout_decide',
  resumePayout: 'payout_decide',
  voidPayout: 'payout_decide',
  settings: 'settings',
} as const
const actions = z.enum(['approve', 'reject', 'allowReapply', 'set', 'membership', 'annotate', 'adjust', 'release', 'rebind', 'hold', 'paid', 'resumePayout', 'voidPayout', 'settings', 'recompute', 'feeRule'])

export async function execute(db: SupabaseClient, actor: string, form: FormData) {
  const action = actions.parse(form.get('operation'))
  const fields = Object.fromEntries(form)
  if (action === 'recompute') {
    const { payment_id } = commands.recompute.parse(fields)
    checked(await db.rpc('admin_affiliate_recompute', { p_actor: actor, p_payment_id: payment_id }))
    return
  }
  if (action === 'feeRule') return outcome(await db.rpc('admin_affiliate_fee_rule_save', { p_actor: actor, p_input: feeRuleInput(form) }))
  const input = commands[action].parse(fields)
  const rates = action === 'set' ? { overrides: rateInputs(form, true) } : {}
  const settings = action === 'settings' ? { rates: rateInputs(form, false) } : {}
  const result = await db.rpc('admin_affiliate_' + rpcName[action], { p_actor: actor, p_input: { ...input, ...rates, ...settings } })
  const answer = outcome(result)
  if (answer || action !== 'membership') return answer
  return fields.status === 'suspended' ? 'membershipSuspended' : 'membershipRestored'
}

// Database refusals the operator can act on; anything else is a failure.
const answers = {
  AFFILIATE_PAYOUT_AMOUNT_CHANGED: 'amountChanged',
  AFFILIATE_PAYOUT_RECOMPUTE_PENDING: 'recomputePending',
  AFFILIATE_PAYOUT_NET_ZERO: 'netZero',
  AFFILIATE_FEE_RULE_CHANGED: 'feeRuleChanged',
  AFFILIATE_FEE_RULE_IN_FORCE: 'feeRuleInForce',
  AFFILIATE_ORG_MEMBER: 'orgMember',
  AFFILIATE_ORG_ACCOUNT: 'orgAccount',
} as const
function outcome(result: { data: unknown; error: { message: string } | null }) {
  const message = result.error?.message
  if (message && message in answers) return answers[message as keyof typeof answers]
  checked(result)
}
