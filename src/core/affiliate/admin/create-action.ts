'use server'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { requireAffiliateAdmin } from './access'
import { COPY } from './copy'
import { createAffiliate } from './create'
import { EnrollmentError } from './create-account'

export async function enrollAffiliate(form: FormData) {
  const admin = await requireAffiliateAdmin()
  try {
    const result = await createAffiliate(createAdminSupabase(), admin.id, form)
    refresh()
    return { ok: true as const, ...result }
  } catch (error) {
    const message = error instanceof EnrollmentError ? error.message : error instanceof z.ZodError ? COPY.invalid : COPY.failed
    return { ok: false as const, message }
  }
}
