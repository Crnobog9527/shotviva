import 'server-only'
import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { type ActionValue } from '@/core/admin'
import { CODE_EDITOR_COPY, editorFailure } from '@/core/admin/code-editor'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { saveCampaignWithCoupon } from '@/core/codes/server'
import { currentProducts } from '@/site/billing/display-products'

// The admin workflow provisions coupons on the Stripe account for this deployment. Catalog and actor
// always come from the server, including for edits that only change a note or expiry date.
export async function saveCampaignCode(codeId: string, fields: unknown) {
  const actor = await requireAdmin()
  if (actor.banned) throw new AppError('FORBIDDEN', CODE_EDITOR_COPY.denied)
  const db = createAdminSupabase()
  return saveCampaignWithCoupon(db, actor.id, codeId, fields, await currentProducts(db), () => stripeClient().coupons)
}

export async function submitCampaignCode(codeId: string, fields: unknown): Promise<ActionValue<string>> {
  'use server'
  try {
    const id = await saveCampaignCode(codeId, fields)
    revalidatePath('/[locale]/admin/codes', 'layout')
    return { ok: true, value: id }
  } catch (error) {
    unstable_rethrow(error)
    const message = editorFailure(error)
    if (message === CODE_EDITOR_COPY.failed) logger.error('admin.codes.save_failed', { error_type: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, code: error instanceof AppError ? error.code : 'INTERNAL', message }
  }
}
