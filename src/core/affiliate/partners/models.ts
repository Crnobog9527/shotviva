import { z } from 'zod'
import { affiliateStatus, slugSchema } from '../enrollment'
import { audienceRanges, channelTypes, countryCodes } from './application-options'

export { affiliateStatus, slugSchema }

export const payoutMethods = ['paypal', 'wise', 'bank', 'alipay', 'other'] as const
export const dashboardViews = ['overview', 'commissions', 'referrals', 'team', 'payouts', 'settings'] as const
export const commissionStatus = z.enum(['pending', 'on_hold', 'confirmed', 'void'])
export const idSchema = z.union([z.number().int().safe(), z.string().regex(/^\d+$/)])
const cents = z.number().int().safe()

// The five required keys are checked again by affiliate_apply; the rest are optional extras.
export const applicationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  country: z.enum(countryCodes),
  channel_type: z.enum(channelTypes),
  channel: z.string().trim().min(1).max(2048),
  other_channels: z.string().trim().max(2000).optional().transform((value) => value || undefined),
  audience: z.enum(audienceRanges),
  plan: z.string().trim().min(1).max(2000),
  contact: z.string().trim().max(200).optional().transform((value) => value || undefined),
})
export const accountSchema = z.object({
  slug: slugSchema,
  status: affiliateStatus,
  team_enabled: z.boolean(),
  reject_reason: z.string().nullable(),
  reapply_allowed: z.boolean(),
  payout_method: z.enum(payoutMethods).nullable(),
  payout_details: z.string().nullable(),
  us_person: z.boolean().nullable(),
  terms_version: z.string().nullable(),
  terms_accepted_at: z.string().nullable(),
})
export const settingsSchema = z.object({
  settlement_day: z.number().int(),
  payout_min_usd: cents,
  hold_days: z.number().int(),
  terms_version: z.string(),
  apply_min_level: z.enum(['none', 'any_paid', 'starter', 'pro', 'max']),
})
export const summarySchema = z.object({
  clicks: cents,
  referred: cents,
  paidUsers: cents,
  pending: cents,
  available: cents,
  paid: cents,
  maturing: cents,
  nextSettlement: z.string(),
})
export const commissionSchema = z.object({
  id: idSchema,
  created_at: z.string(),
  product_id: z.string(),
  base_usd: cents,
  rate_bp: z.number().int(),
  amount: cents,
  status: commissionStatus,
  confirm_after: z.string(),
})
export const changeSchema = z.object({
  id: idSchema,
  at: z.string(),
  old_status: commissionStatus.nullable(),
  new_status: commissionStatus,
  old_amount: cents.nullable(),
  new_amount: cents,
  reason: z.string(),
})
export const payoutSchema = z.object({
  id: idSchema,
  created_at: z.string(),
  period: z.string(),
  amount: cents,
  paid_amount: cents.nullable(),
  status: z.enum(['due', 'paid', 'held', 'void']),
  paid_at: z.string().nullable(),
})
export const memberSchema = z.object({ slug: slugSchema, created_at: z.string(), status: affiliateStatus })
export const referralSchema = z.object({
  masked_hash: z.string().regex(/^[0-9a-f]{64}$/),
  referred_at: z.string(),
  payment_count: cents,
  commission_amount: cents,
})
export type Account = z.infer<typeof accountSchema>
export type Settings = z.infer<typeof settingsSchema>
export type EnrollmentSettings = Pick<Settings, 'apply_min_level' | 'terms_version'>
export type Commission = z.infer<typeof commissionSchema>
export type View = (typeof dashboardViews)[number]
export type SearchParams = Record<string, string | string[] | undefined>
export const searchSchema = z.object({
  view: z.enum(dashboardViews).catch('overview'),
  cursor: z.string().max(640).optional().catch(undefined),
  bonus: z.string().max(640).optional().catch(undefined),
  entry: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional()
    .catch(undefined),
  changes: z.string().max(640).optional().catch(undefined),
})
export type Query = z.infer<typeof searchSchema>
