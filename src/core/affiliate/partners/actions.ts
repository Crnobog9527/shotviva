'use server'

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { isAffiliateEnabled } from '../feature'
import { publishedTerms } from './terms'
import { applicationSchema, payoutMethods, slugSchema } from './models'

export type PartnerFormState = '' | 'invalid' | 'failed' | 'saved'
const acceptance = z.object({ accept: z.literal('on'), termsVersion: z.string().trim().min(1).max(100) })
const applySchema = applicationSchema.extend({
  ...acceptance.shape,
  parent: z.union([slugSchema, z.literal('')]),
})
const profileSchema = acceptance
  .extend({
    method: z.union([z.enum(payoutMethods), z.literal('')]),
    details: z.string().trim().max(2000),
    us: z.enum(['yes', 'no']),
  })
  .refine((value) => !value.method || value.details.length > 0)

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
  if (!(await publishedTerms(termsVersion))) return 'failed'
  const { error } = await createAdminSupabase().rpc('affiliate_save_profile', {
    p_user: user.id,
    p_payout_method: method || null,
    p_payout_details: method ? details : null,
    p_us_person: us === 'yes',
    p_terms_version: termsVersion,
  })
  if (error) return 'failed'
  revalidatePath(await localized('/partners'))
  return 'saved'
}
