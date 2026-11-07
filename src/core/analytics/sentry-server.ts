import * as Sentry from '@sentry/nextjs'

import { serverEnv } from '../env'
import { signalServerError } from './server-errors'
import { sentryOptions } from './sentry-options'

// Called from src/instrumentation.ts register() for both the Node and the edge runtime;
// @sentry/nextjs resolves the matching SDK per runtime. Without a DSN nothing is set up.
export function registerSentry(): void {
  const options = sentryOptions(serverEnv().VERCEL_ENV)
  if (!options.enabled) return
  Sentry.init(options)
}

// Next.js calls this for errors thrown while rendering or in route handlers. Sentry records it as
// before; the Owner's error-rate alert counts it (T72).
export const onRequestError: typeof Sentry.captureRequestError = (error, request, context) => {
  signalServerError({ source: 'request', path: request.path })
  return Sentry.captureRequestError(error, request, context)
}
