import { captureAlertWith, captureErrorWith, type AlertKind, type CaptureContext } from '../capture-scope'
import { withSdks } from './sdk'

// Error boundaries report here. Sentry loads after the page (sdk.ts), so a capture made before
// that waits in the queue and is sent once it is in; without a DSN it is dropped.
export function captureError(error: unknown, ctx: CaptureContext = {}): void {
  withSdks(({ sentry }) => {
    if (sentry) captureErrorWith(sentry, error, ctx)
  })
}

export function captureAlert(alert: AlertKind, message: string, ctx: Omit<CaptureContext, 'alert'> = {}): void {
  withSdks(({ sentry }) => {
    if (sentry) captureAlertWith(sentry, alert, message, ctx)
  })
}
