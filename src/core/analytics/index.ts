// Server-side entry (ARCHITECTURE §16). Browser code imports '@/core/analytics/browser'.
// Nothing outside core/analytics may import posthog-js or @sentry/nextjs (ESLint).
export {
  BROWSER_EVENTS,
  SERVER_EVENTS,
  eventSchemas,
  uploadSizeBucket,
  validateEvent,
  type BrowserEventName,
  type EventName,
  type EventProps,
  type ServerEventName,
} from './events'
export { createServerTracker, track, type ServerTrack, type TrackContext } from './server-track'
export { trackCheckoutStart, trackPurchase } from './funnel'
export { ALERTS, captureAlert, captureError, type AlertKind, type CaptureContext } from './capture-error'
export { onRequestError, registerSentry } from './sentry-server'
export { REPLAY_BLOCK_CLASS } from './replay'
