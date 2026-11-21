'use server'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { logger } from '@/core/logger'
import { COPY, FEE_COPY, START_COPY, isFeeAnswer, enrollAffiliate, enrollmentLabel, execute, requireAffiliateAdmin, startPaymentFees } from '@/core/affiliate/admin'
import { latestAffiliateTermsVersion } from '@/site/content/affiliate-terms'

// Admin saves used to fail silently; record why so the next report can be traced in the logs.
function logFailure(form: FormData, error: unknown) {
  const invalid = error instanceof z.ZodError
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined
  logger.warn('affiliate_admin.save_failed', {
    operation: String(form.get('operation')),
    kind: invalid ? 'invalid' : 'failed',
    reason: invalid ? error.issues.map((i) => i.path.join('.')).join(',') : cause,
  })
}

export async function saveAffiliate(_state: string, form: FormData) {
  // Forms rendered before the new enrollment UI used this action and the email field.
  if (form.get('operation') === 'create') {
    const result = await enrollAffiliate(form)
    if (!result.ok) return result.message
    return [result.existing ? COPY.existing : COPY.saved, enrollmentLabel(result.member), result.member.slug].join(' · ')
  }
  const admin = await requireAffiliateAdmin()
  // Fee go-live: one-way, sets record_from and the newest terms together (admin only, as above).
  if (form.get('operation') === 'feesStart') {
    try {
      const answer = await startPaymentFees(createAdminSupabase(), admin.id, form, latestAffiliateTermsVersion())
      refresh()
      return START_COPY.answers[answer]
    } catch (error) {
      logFailure(form, error)
      return COPY.failed
    }
  }
  try {
    const result = await execute(createAdminSupabase(), admin.id, form)
    if (result) {
      refresh()
      return isFeeAnswer(result) ? FEE_COPY[result] : COPY[result]
    }
  } catch (error) {
    logFailure(form, error)
    return error instanceof z.ZodError ? COPY.invalid : COPY.failed
  }
  refresh()
  return COPY.saved
}
