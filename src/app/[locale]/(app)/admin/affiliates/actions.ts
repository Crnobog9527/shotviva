'use server'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import {
  COPY, FEE_COPY, START_COPY, isFeeAnswer, enrollAffiliate, enrollmentLabel, execute, requireAffiliateAdmin, startPaymentFees,
  decidePromo, runPromoNow, setPromoPartner, topupPromo, voidPromo,
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
// void a granted sheet whose credits were taken back by hand.
type OwnOperation = (db: ReturnType<typeof createAdminSupabase>, actor: string, form: FormData) => Promise<string>
const ownAnswers: Record<string, OwnOperation> = {
  feesStart: async (db, actor, form) => START_COPY.answers[await startPaymentFees(db, actor, form, latestAffiliateTermsVersion())] ?? COPY.failed,
  promoDecide: decidePromo,
  promoPartner: setPromoPartner,
  promoRun: (db, actor) => runPromoNow(db, actor),
  promoTopup: topupPromo,
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

// The program's master switch (moved here from 功能开关, Owner 2026-11-27). requireAdmin, not
// requireAffiliateAdmin: it has to turn the program back on while it is off.
export async function saveAffiliateSwitchAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(input)
    if (!parsed.success) throw new AppError('INVALID_INPUT', COPY.invalid)
    const { error } = await createAdminSupabase().rpc('admin_affiliate_settings', {
      p_actor: admin.id, p_input: { enabled: parsed.data.enabled },
    })
    if (error) throw new AppError('INTERNAL', 'affiliate switch save failed', { cause: new Error(error.message) })
    refresh()
  })
}
