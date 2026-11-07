import { NextResponse } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { resolvePaymentDocument } from '@/core/billing/documents'
import { stripeClient } from '@/core/billing/stripe'
import { localized } from '@/core/i18n/server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// GET → 302 to the payment provider's receipt or invoice for one of the signed-in user's
// payments, read from Stripe on this click (ARCHITECTURE §6.3, T80). Anyone else's payment is
// 404. When the provider has nothing to open right now, back to Purchases with a note.
export async function GET(request: Request, { params }: RouteContext<'/[locale]/account/purchases/[paymentId]/[document]'>) {
  try {
    const user = await requireApiUser()
    const { paymentId, document } = await params
    const deps = { db: createAdminSupabase(), stripe: stripeClient }
    const url = await resolvePaymentDocument(deps, { userId: user.id, paymentId, document })
    const target = url ?? new URL(await localized('/account?purchases=unavailable'), request.url)
    return NextResponse.redirect(target, { status: 302, headers: NO_STORE })
  } catch (error) {
    return errorResponse(error, 'purchase-document')
  }
}
