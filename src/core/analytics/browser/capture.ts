import { captureAlertWith, captureErrorWith, type AlertKind, type CaptureContext } from '../capture-scope'
import { sentrySdk } from './sdk'

// Error boundaries report here. Sentry loads after the page (sdk.ts), so a capture made before
// that waits in the queue and is sent once it is in; without a DSN it is dropped.
export function captureError(error: unknown, ctx: CaptureContext = {}): void {
  sentrySdk.run((sentry) => captureErrorWith(sentry, error, ctx))
}

export function captureAlert(alert: AlertKind, message: string, ctx: Omit<CaptureContext, 'alert'> = {}): void {
  sentrySdk.run((sentry) => captureAlertWith(sentry, alert, message, ctx))
}

// Sentry installs its own listeners at init. Catch uncaught JavaScript errors and rejected
// promises until then, without also reporting failed images or other resource loads.
export function watchEarlyErrors(): () => void {
  const onError = (event: ErrorEvent) => {
    if (event.target === window && (event.error || event.message)) captureError(event.error ?? event.message)
  }
  const onRejection = (event: PromiseRejectionEvent) => captureError(event.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
