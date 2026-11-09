import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { confirmUrl } from '@/core/auth/flows/callback-url'
import { checked } from './read'
import { findUser } from './summary'
import { categories } from './query'

const uuid = z.uuid()
const required = z.string().trim().min(1).max(2000)
const slug = z
  .string()
  .regex(/^[a-z0-9-]{3,24}$/)
  .refine((s) => !['admin', 'api', 'www', 'shotviva', 'partners', 'support'].includes(s))
const rowId = z.string().regex(/^[1-9]\d{0,17}$/)
const money = z
  .string()
  .regex(/^-?\d{1,10}(?:\.\d{1,2})?$/)
  .transform((s) => Math.round(Number(s) * 100))
const percent = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
  .transform((s) => Math.round(Number(s) * 100))
  .pipe(z.number().max(10000))
const optionalRate = z.union([z.literal('').transform(() => null), percent])
const user = z.object({ user_id: uuid })
const rateInputs = (form: FormData, optional: boolean) =>
  categories.map((product_kind) => {
    const field = optional ? optionalRate : percent
    return { product_kind, l1_bp: field.parse(form.get(product_kind + '_l1')), l2_bp: field.parse(form.get(product_kind + '_l2')) }
  })
const commands = {
  approve: user.extend({ slug }).transform((i) => ({ ...i, status: 'active' })),
  reject: user.extend({ reason: required }).transform((i) => ({ ...i, status: 'rejected' })),
  set: user.extend({
    slug,
    status: z.enum(['active', 'suspended', 'banned']),
    parent_user_id: z.union([z.literal('').transform(() => null), uuid]),
    team_enabled: z.literal('on').optional().transform(Boolean),
    void_unconfirmed: z.literal('on').optional().transform(Boolean),
  }),
  adjust: user.extend({ amount: money.refine((n) => n !== 0), reason: required, request_id: uuid }),
  release: z.object({ commission_id: rowId, decision: z.enum(['release', 'void']), reason: required }),
  rebind: user.extend({ affiliate_user_id: z.union([z.literal('').transform(() => null), uuid]), reason: required }),
  hold: z.object({ payout_id: rowId, note: required }).transform((i) => ({ ...i, status: 'held' })),
  paid: z
    .object({
      payout_id: rowId,
      paid_at: z.iso.date(),
      method: required,
      paid_reference: z.string().trim().max(250),
      note: z.string().trim().max(2000),
    })
    .refine((i) => Boolean(i.paid_reference || i.note))
    .transform((i) => ({ ...i, status: 'paid' })),
  settings: z.object({
    hold_days: z.coerce.number().int().nonnegative(),
    payout_min_usd: money.refine((n) => n > 0),
    settlement_day: z.coerce.number().int().min(1).max(28),
    apply_min_level: z.enum(['none', 'any_paid', 'starter', 'pro', 'max']),
    terms_version: required,
  }),
  create: z.object({ email: z.email(), slug }),
  recompute: z.object({ payment_id: z.string().regex(/^[1-9]\d{0,17}$/) }),
}
const rpcName = {
  approve: 'decide',
  reject: 'decide',
  set: 'set',
  adjust: 'adjust',
  release: 'commission_release',
  rebind: 'rebind',
  hold: 'payout_decide',
  paid: 'payout_decide',
  settings: 'settings',
} as const
const actions = z.enum(['approve', 'reject', 'set', 'adjust', 'release', 'rebind', 'hold', 'paid', 'settings', 'create', 'recompute'])

async function create(db: SupabaseClient, actor: string, form: FormData) {
  const input = commands.create.parse(Object.fromEntries(form))
  const overrides = rateInputs(form, true)
  const existing = await findUser(db, actor, input.email)
  const userId = existing?.user_id ?? (await invite(db, input.email))
  checked(await db.rpc('admin_affiliate_create', { p_actor: actor, p_input: { user_id: userId, slug: input.slug, overrides } }))
}
async function invite(db: SupabaseClient, email: string) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: confirmUrl('/partners') })
  if (error || !data.user) throw new Error('Affiliate invitation failed')
  return data.user.id
}
export async function execute(db: SupabaseClient, actor: string, form: FormData) {
  const action = actions.parse(form.get('operation'))
  if (action === 'create') return create(db, actor, form)
  const fields = Object.fromEntries(form)
  if (action === 'recompute') {
    const { payment_id } = commands.recompute.parse(fields)
    checked(await db.rpc('admin_affiliate_recompute', { p_actor: actor, p_payment_id: payment_id }))
    return
  }
  const input = commands[action].parse(fields)
  const rates = action === 'set' ? { overrides: rateInputs(form, true) } : {}
  const settings = action === 'settings' ? { rates: rateInputs(form, false) } : {}
  checked(await db.rpc('admin_affiliate_' + rpcName[action], { p_actor: actor, p_input: { ...input, ...rates, ...settings } }))
}
