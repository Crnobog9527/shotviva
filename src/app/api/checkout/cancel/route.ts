import { NextResponse, type NextRequest } from 'next/server'

import { trackCheckoutCancel } from '@/core/analytics'
import { getSessionUser } from '@/core/auth'
import { handleCancelReturn } from '@/core/billing/stripe'

// Stripe's cancel_url (T74, ARCHITECTURE §16.2). Public on purpose: it is a browser redirect
// back from Stripe, answers nothing but a 303 to /pricing?checkout=cancel, and only counts the
// cancel (`checkout_cancel`, server-side) when the buyer is signed in.
export async function GET(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  const target = handleCancelReturn(request.nextUrl.searchParams, user?.id ?? null, trackCheckoutCancel)
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 303)
}
