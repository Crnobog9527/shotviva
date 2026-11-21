import 'server-only'
import { NextResponse } from 'next/server'

import { signalServerError } from './analytics/server-errors'
import { toAppError } from './errors'
import { logger } from './logger'
import { RATE_LIMITED_RETRY_SECONDS } from './retry-after'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

// One error shape for every API route: { code, message, ...extras }. Unknown errors become
// INTERNAL (details stay in the log, never in the response).
export function errorResponse(error: unknown, route: string): NextResponse {
  const appError = toAppError(error)
  if (appError.code === 'INTERNAL') {
    logger.error('api error', { route, error: appError.cause ?? error })
    signalServerError({ source: 'api', route })
  }
  const response = jsonResponse(appError.toBody(), appError.status)
  // A throttled request is queued, not failed: tell the caller when to come back.
  if (appError.code === 'RATE_LIMITED') response.headers.set('Retry-After', String(RATE_LIMITED_RETRY_SECONDS))
  return response
}
