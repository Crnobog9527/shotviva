import type { AlertKind } from './capture-scope'

// Server errors as they happen, for the Owner's 「网站报错异常」 alert (ARCHITECTURE §16.4, T72).
// core/alerts subscribes at start-up (src/instrumentation.node.ts) instead of being imported
// here, so analytics keeps no dependency on alerts and the edge bundle never loads it.

export type ServerErrorSignal =
  // Next.js onRequestError: thrown while rendering, in a route handler or a server action.
  | { source: 'request'; path: string }
  // An API route answered 500 INTERNAL through errorResponse (core/api-response).
  | { source: 'api'; route: string }
  // captureError on the server.
  | { source: 'capture'; alert: AlertKind | null; level: 'warning' | 'error' | 'fatal' }

type Listener = (signal: ServerErrorSignal) => void

let listener: Listener | null = null

export function onServerError(next: Listener | null): void {
  listener = next
}

// Never throws: a counting bug must not turn a handled error into an unhandled one.
export function signalServerError(signal: ServerErrorSignal): void {
  try {
    listener?.(signal)
  } catch {
    // The alert path is best effort; Sentry still has the error.
  }
}
