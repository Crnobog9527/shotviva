import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COPY } from './copy'
import { resolveAccount, EnrollmentError } from './create-account'
import { enrollmentRow, newAffiliateSlug, writableSlug } from './enrollment'
import { rateInputs } from './rate-inputs'
import { checked } from './read'

async function membership(db: SupabaseClient, userId: string) {
  const row = await db.from('affiliates').select('slug,status,source:application->>source').eq('user_id', userId).maybeSingle()
  return enrollmentRow.nullable().parse(checked(row))
}

export async function createAffiliate(db: SupabaseClient, actor: string, form: FormData) {
  const parsed = writableSlug.safeParse(form.get('slug') || newAffiliateSlug())
  if (!parsed.success) throw new EnrollmentError(COPY.reserved)
  const overrides = rateInputs(form, true)
  const userId = await resolveAccount(db, actor, form)
  let slug = parsed.data
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await db.rpc('admin_affiliate_create', { p_actor: actor, p_input: { user_id: userId, slug, overrides } })
    if (result.error && result.error.code !== '23505') checked(result)
    // Either our insert or the winning concurrent insert owns this user's primary key.
    const member = await membership(db, userId)
    if (member) return { member, existing: Boolean(result.error) }
    if (!result.error?.message.includes('affiliates_slug_key')) throw new Error('Affiliate enrollment unavailable')
    slug = newAffiliateSlug()
  }
  throw new EnrollmentError(COPY.collision)
}
