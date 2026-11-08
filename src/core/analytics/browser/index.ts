// Browser entry (ARCHITECTURE §16). Server code imports '@/core/analytics'.
export {
  identify,
  initBrowserAnalytics,
  onRouterTransitionStart,
  resetIdentity,
  track,
  trackBusinessInquiry,
  trackContactSales,
  trackPaywallSelect,
  trackPaywallView,
  trackTemplateFavorite,
  trackTemplateView,
  trackUploadError,
} from './client'
export { AnalyticsIdentify } from './analytics-identify'
export { ConsentSlot } from '../consent-ui/consent-slot'
export { CookieSettingsButton } from '../consent-ui/cookie-settings-button'
export { REPLAY_BLOCK_CLASS } from '../replay'
export { captureAlert, captureError } from './capture'
export { type AlertKind } from '../capture-scope'
export { uploadSizeBucket } from '../events'
