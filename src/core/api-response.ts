import 'server-only'
import { NextResponse } from 'next/server'

import { toAppError } from './errors'
import { logger } from './logger'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

// One error shape for every API route: { code, message, ...extras }. Unknown errors become
// INTERNAL (details stay in the log, never in the response).
export function errorResponse(error: unknown, route: string): NextResponse {
  const appError = toAppError(error)
  if (appError.code === 'INTERNAL') logger.error('api error', { route, error: appError.cause ?? error })
  return jsonResponse(appError.toBody(), appError.status)
}
