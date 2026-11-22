import 'server-only'

import { logger } from '../../logger'
import { checkoutBillingProfile, type BillingProfile } from '../../org/billing/profile'
import type { RpcClient } from '../rpc'
import type { WaffoBillingDetail } from './client'

// 开票信息 on Waffo invoices (ARCHITECTURE §6.5). Waffo is the Merchant of Record, so it is the
// seller on the invoice; `billingDetail` on create-checkout-session pre-fills the buyer side:
// with isBusiness true, businessName and taxId are printed on the invoice. It is only a pre-fill:
// the buyer can still change it on Waffo's page and later in the Waffo Consumer Portal.
// Waffo ignores billingDetail in subscription plan-change mode; Shotviva never opens that mode
// (an upgrade is an ordinary checkout, see app/api/checkout), so every session we create carries it.
// Stripe never gets it: Managed Payments cannot show a buyer company.

export function waffoBillingDetail(profile: BillingProfile | null): WaffoBillingDetail | undefined {
  if (!profile) return undefined
  return {
    country: profile.country,
    isBusiness: true,
    businessName: profile.legalName,
    taxId: profile.taxId,
    ...(profile.postcode && { postcode: profile.postcode }),
    ...(profile.state && { state: profile.state }),
  }
}

// The buyer's company title when the buyer is the current owner of an org that saved one; for
// everyone else undefined, so their checkout is unchanged. A failed read never blocks a purchase:
// the session goes out without the title and the buyer can add it in the Waffo portal.
export async function buyerBillingDetail(db: RpcClient, userId: string): Promise<WaffoBillingDetail | undefined> {
  try {
    return waffoBillingDetail(await checkoutBillingProfile(db, userId))
  } catch {
    logger.warn('waffo billing detail read failed; checkout continues without it')
    return undefined
  }
}
