'use server'

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { isAffiliateEnabled } from '../feature'
import { publishedTerms } from './terms'
import { applicationSchema, payoutMethods, slugSchema } from './models'
import { readAccount } from './repository'

export type PartnerFormState = '' | 'invalid' | 'failed' | 'saved'
const acceptance = z.object({ accept: z.literal('on'), termsVersion: z.string().trim().min(1).max(100) })
const applySchema = applicationSchema.extend({
  ...acceptance.shape,
  parent: z.union([slugSchema, z.literal('')]),
})
const profileSchema = acceptance.partial()
  .extend({
    method: z.union([z.enum(payoutMethods), z.literal('')]),
    details: z.string().trim().max(2000),
    us: z.enum(['yes', 'no']),
  })
  .refine((value) => !value.method || value.details.length > 0)
  .refine((value) => Boolean(value.accept) === Boolean(value.termsVersion))

export async function applyAction(_: PartnerFormState, form: FormData): Promise<PartnerFormState> {
  if (!(await isAffiliateEnabled())) notFound()
  const fields = applySchema.safeParse(Object.fromEntries(form))
  if (!fields.success) return 'invalid'
  const { parent, termsVersion, ...input } = fields.data
  if (!(await publishedTerms(termsVersion))) return 'failed'
  const user = await requireUser('/partners/apply' + (parent ? '?by=' + parent : ''))
  const { error } = await createAdminSupabase().rpc('affiliate_apply', {
    p_user: user.id,
    p_application: applicationSchema.parse(input),
    p_parent_slug: parent || null,
    p_terms_version: termsVersion,
  })
  if (error) return 'failed'
  return 'saved'
}

export async function saveAction(_: PartnerFormState, form: FormData): Promise<PartnerFormState> {
  if (!(await isAffiliateEnabled())) notFound()
  const user = await requireUser('/partners?view=settings')
  const fields = profileSchema.safeParse(Object.fromEntries(form))
  if (!fields.success) return 'invalid'
  const { method, details, us, termsVersion } = fields.data
  if (termsVersion && !(await publishedTerms(termsVersion))) return 'failed'
  const { error } = await createAdminSupabase().rpc('affiliate_save_profile', {
    p_user: user.id,
    p_payout_method: method || null,
    p_payout_details: method ? details : null,
    p_us_person: us === 'yes',
    p_terms_version: termsVersion ?? null,
  })
  if (error) return 'failed'
  revalidatePath(await localized('/partners'))
  return 'saved'
}

// Re-acceptance after the program's terms version moved on (the gate on every dashboard view,
// personal and enterprise). Payout details are carried over unchanged; the database records the
// current version and time. The version is checked against the published text and, in the
// database, against the live setting.
export async function acceptTermsAction(_: PartnerFormState, form: FormData): Promise<PartnerFormState> {
  if (!(await isAffiliateEnabled())) notFound()
  const user = await requireUser('/partners')
  const fields = acceptance.safeParse(Object.fromEntries(form))
  if (!fields.success) return 'invalid'
  const { termsVersion } = fields.data
  if (!(await publishedTerms(termsVersion))) return 'failed'
  const account = await readAccount(user.id)
  if (account?.status !== 'active') return 'failed'
  const { error } = await createAdminSupabase().rpc('affiliate_save_profile', {
    p_user: user.id,
    p_payout_method: account.payout_method,
    p_payout_details: account.payout_method ? account.payout_details : null,
    p_us_person: account.us_person ?? false,
    p_terms_version: termsVersion,
  })
  if (error) return 'failed'
  revalidatePath(await localized('/partners'))
  revalidatePath(await localized('/partners/enterprise'))
  return 'saved'
}
