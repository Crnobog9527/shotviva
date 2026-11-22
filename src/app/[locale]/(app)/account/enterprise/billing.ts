import 'server-only'

import type { BillingActions } from '@/core/org/ui'
import { getBillingProfile } from '@/core/org/billing'
import type { RpcClient } from '@/core/billing/rpc'
import { logger } from '@/core/logger'

import { clearBillingProfileAction, saveBillingProfileAction } from './billing-actions'

export const billingActions: BillingActions = { save: saveBillingProfileAction, clear: clearBillingProfileAction }

// The workbench still opens when the 开票信息 read fails; the card says so instead of the form.
export async function readBilling(db: RpcClient, owner: string) {
  try {
    return { profile: await getBillingProfile(db, owner), unavailable: false }
  } catch {
    logger.error('org billing profile read failed')
    return { profile: null, unavailable: true }
  }
}
