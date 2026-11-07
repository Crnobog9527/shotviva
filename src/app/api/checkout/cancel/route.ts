import { NextResponse, type NextRequest } from 'next/server'

import { trackCheckoutCancel } from '@/core/analytics'
import { getSessionUser } from '@/core/auth'
import { CANCEL_COOKIE, handleCancelReturn } from '@/core/billing/stripe'

// Stripe's cancel_url (T74, ARCHITECTURE §16.2). Public on purpose: it is a browser redirect
// back from Stripe, answers nothing but a 303 to /pricing?checkout=cancel, and only counts the
// cancel (`checkout_cancel`, server-side) when the buyer is signed in, once per checkout: the
// counted attempt id stays in a cookie only this route reads.
export async function GET(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  const counted = request.cookies.get(CANCEL_COOKIE)?.value
  const { target, remember } = handleCancelReturn(request.nextUrl.searchParams, user?.id ?? null, trackCheckoutCancel, counted)
  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin), 303)
  if (remember) {
    response.cookies.set(CANCEL_COOKIE, remember, { path: '/api/checkout/cancel', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 86_400 })
  }
  return response
}
