import { NextResponse, type NextRequest } from 'next/server'

import { logger } from '@/core/logger'
import { trackCheckoutCancel } from '@/core/analytics'
import { createAdminSupabase, getSessionUser, isAuthUnavailable } from '@/core/auth'
import { CANCEL_COOKIE, DISCOUNT_CANCEL_COOKIE, discountedCancelSession, expireAndRelease, handleCancelReturn, stripeClient } from '@/core/billing/stripe'

// Stripe's cancel_url (T74, ARCHITECTURE §16.2). Public on purpose: it is a browser redirect
// back from Stripe, answers nothing but a 303 to /pricing?checkout=cancel, and only counts the
// cancel (`checkout_cancel`, server-side) when the buyer is signed in, once per checkout: the
// counted attempt id stays in a cookie only this route reads.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('c')
  const sessionId = discountedCancelSession(request.cookies.get(DISCOUNT_CANCEL_COOKIE)?.value, token)
  const user = await cancelingUser(Boolean(sessionId && token))
  if (user === RETRY) return retryLater()
  if (user && sessionId && token) await releaseDiscount(user.id, token, sessionId)
  return cancelRedirect(request, user?.id ?? null)
}

function cancelRedirect(request: NextRequest, userId: string | null): NextResponse {
  const counted = request.cookies.get(CANCEL_COOKIE)?.value
  const { target, remember } = handleCancelReturn(request.nextUrl.searchParams, userId, trackCheckoutCancel, counted)
  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin), 303)
  if (remember) {
    response.cookies.set(CANCEL_COOKIE, remember, { path: '/api/checkout/cancel', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 86_400 })
  }
  return response
}

const RETRY = Symbol('retry')

// A discounted checkout to release, but Auth or the database cannot say whose it is right now:
// a retryable 503 rather than a redirect that would skip the release for good (ARCHITECTURE §7
// 「会话校验」). Without one, the cancel is simply counted as anonymous.
async function cancelingUser(releasing: boolean) {
  try {
    return await getSessionUser()
  } catch (error) {
    return isAuthUnavailable(error) && releasing ? RETRY : null
  }
}

async function releaseDiscount(userId: string, token: string, sessionId: string) {
  try {
    const stripe = stripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    await expireAndRelease(stripe, createAdminSupabase(), userId, token, session)
  } catch {
    // An uncertain provider outcome cannot release a still-payable checkout.
    logger.warn('Discounted checkout cancellation could not be confirmed', { session_id: sessionId })
  }
}

function retryLater(): NextResponse {
  return new NextResponse('Temporarily unavailable. Reload this page in a moment.\n暂时无法处理，请稍后刷新本页。\n', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
