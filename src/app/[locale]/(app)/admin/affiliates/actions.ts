'use server'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { logger } from '@/core/logger'
import {
  COPY, FEE_COPY, START_COPY, isFeeAnswer, enrollAffiliate, enrollmentLabel, execute, requireAffiliateAdmin, startPaymentFees,
  decidePromo, movePromo, runPromoNow, setPromoPartner, topupPromo, voidPromo,
} from '@/core/affiliate/admin'
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

// Operations that answer with their own line (admin only, as above). Fee go-live: one-way, sets
// record_from and the newest terms together. Channel partner promotion credits (ARCHITECTURE §6.5
// 渠道商推广积分): decide a sheet, mark a partner, generate this month's sheets, top up a partner,
// move this month's old grants into the org's promo pool, or void a granted sheet whose credits were taken back by hand.
type OwnOperation = (db: ReturnType<typeof createAdminSupabase>, actor: string, form: FormData) => Promise<string>
const ownAnswers: Record<string, OwnOperation> = {
  feesStart: async (db, actor, form) => START_COPY.answers[await startPaymentFees(db, actor, form, latestAffiliateTermsVersion())] ?? COPY.failed,
  promoDecide: decidePromo,
  promoPartner: setPromoPartner,
  promoRun: (db, actor) => runPromoNow(db, actor),
  promoTopup: topupPromo,
  promoMove: movePromo,
  promoVoid: voidPromo,
}

async function runOwn(operation: OwnOperation, actor: string, form: FormData) {
  try {
    const answer = await operation(createAdminSupabase(), actor, form)
    refresh()
    return answer
  } catch (error) {
    logFailure(form, error)
    return COPY.failed
  }
}

export async function saveAffiliate(_state: string, form: FormData) {
  // Forms rendered before the new enrollment UI used this action and the email field.
  if (form.get('operation') === 'create') {
    const result = await enrollAffiliate(form)
    if (!result.ok) return result.message
    return [result.existing ? COPY.existing : COPY.saved, enrollmentLabel(result.member), result.member.slug].join(' · ')
  }
  const admin = await requireAffiliateAdmin()
  const own = ownAnswers[String(form.get('operation'))]
  if (own) return runOwn(own, admin.id, form)
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
