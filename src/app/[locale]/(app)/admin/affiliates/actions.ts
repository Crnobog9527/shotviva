'use server'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { COPY, enrollAffiliate, enrollmentLabel, execute, requireAffiliateAdmin } from '@/core/affiliate/admin'

export async function saveAffiliate(_state: string, form: FormData) {
  // Forms rendered before the new enrollment UI used this action and the email field.
  if (form.get('operation') === 'create') {
    const result = await enrollAffiliate(form)
    if (!result.ok) return result.message
    return [result.existing ? COPY.existing : COPY.saved, enrollmentLabel(result.member), result.member.slug].join(' · ')
  }
  const admin = await requireAffiliateAdmin()
  try {
    await execute(createAdminSupabase(), admin.id, form)
  } catch (error) {
    return error instanceof z.ZodError ? COPY.invalid : COPY.failed
  }
  refresh()
  return COPY.saved
}
