import * as Sentry from '@sentry/nextjs'

import { captureAlertWith, captureErrorWith, type AlertKind, type CaptureContext } from './capture-scope'
import { signalServerError } from './server-errors'

export { ALERTS, type AlertKind, type CaptureContext } from './capture-scope'

// Server-side capture (Node and edge import the SDK directly). The browser has its own pair in
// browser/capture.ts, which waits for the SDK it loads after the page.
export function captureError(error: unknown, ctx: CaptureContext = {}): void {
  captureErrorWith(Sentry, error, ctx)
  signalServerError({ source: 'capture', alert: ctx.alert ?? null, level: ctx.level ?? 'error' })
}

export function captureAlert(alert: AlertKind, message: string, ctx: Omit<CaptureContext, 'alert'> = {}): void {
  captureAlertWith(Sentry, alert, message, ctx)
}
