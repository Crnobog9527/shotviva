import type * as SentrySdk from '@sentry/nextjs'

// The capture rules without the SDK itself (type import only), so the browser can run them on
// the SDK it loads after the page (browser/sdk.ts) and the server on the one it imports.

// ARCHITECTURE §16.3 lists what must alert. Each gets a fixed `alert` tag so the Sentry alert
// rules (set up by the Owner) can match on it instead of on message text.
export const ALERTS = [
  // A generation that failed for a reason other than the model declining the content.
  'generation_failed',
  // refund_job failed: the credits stay reserved on a 'running' job until someone fixes it.
  'credit_refund_failed',
  // Payment callbacks (T9): bad signature, processing failure, and charge.refunded.
  'payment_webhook_signature',
  'payment_webhook_failed',
  'charge_refunded',
  // charge.dispute.created (T10, ARCHITECTURE §6.3): recorded, credits not clawed back.
  'charge_disputed',
] as const

export type AlertKind = (typeof ALERTS)[number]

export type CaptureContext = {
  alert?: AlertKind
  level?: 'warning' | 'error' | 'fatal'
  // Ids and codes only (job id, stage, error code); scrubbed again in beforeSend.
  fields?: Record<string, string | number | boolean | null>
}

export type SentryApi = Pick<typeof SentrySdk, 'withScope' | 'captureException' | 'captureMessage'>

function withContext(sentry: SentryApi, ctx: CaptureContext, capture: () => void): void {
  sentry.withScope((scope) => {
    if (ctx.alert) scope.setTag('alert', ctx.alert)
    scope.setLevel(ctx.level ?? 'error')
    if (ctx.fields) scope.setContext('details', ctx.fields)
    capture()
  })
}

// Never throws: reporting must not turn a handled failure into an unhandled one.
export function captureErrorWith(sentry: SentryApi, error: unknown, ctx: CaptureContext = {}): void {
  try {
    withContext(sentry, ctx, () => sentry.captureException(error))
  } catch {
    // Sentry itself failed; the caller has already logged the error through core/logger.
  }
}

// For alerts that are not exceptions, such as a `charge.refunded` notification.
export function captureAlertWith(sentry: SentryApi, alert: AlertKind, message: string, ctx: Omit<CaptureContext, 'alert'> = {}): void {
  try {
    withContext(sentry, { ...ctx, alert, level: ctx.level ?? 'warning' }, () => sentry.captureMessage(message))
  } catch {
    // See captureErrorWith.
  }
}
