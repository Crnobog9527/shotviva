import * as Sentry from '@sentry/nextjs'

import { serverEnv } from '../env'
import { sentryOptions } from './sentry-options'

// Called from src/instrumentation.ts register() for both the Node and the edge runtime;
// @sentry/nextjs resolves the matching SDK per runtime. Without a DSN nothing is set up.
export function registerSentry(): void {
  const options = sentryOptions(serverEnv().VERCEL_ENV)
  if (!options.enabled) return
  Sentry.init(options)
}

// Next.js calls this for errors thrown while rendering or in route handlers.
export const onRequestError = Sentry.captureRequestError
