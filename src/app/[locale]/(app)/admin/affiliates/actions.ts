'use server'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { execute, requireAffiliateAdmin, COPY } from '@/core/affiliate/admin'

export async function saveAffiliate(_state: string, form: FormData) {
  const admin = await requireAffiliateAdmin()
  try {
    await execute(createAdminSupabase(), admin.id, form)
  } catch (error) {
    return error instanceof z.ZodError ? COPY.invalid : COPY.failed
  }
  refresh()
  return COPY.saved
}
