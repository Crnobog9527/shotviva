// Browser entry (ARCHITECTURE §16). Server code imports '@/core/analytics'.
export {
  identify,
  initBrowserAnalytics,
  onRouterTransitionStart,
  resetIdentity,
  track,
  trackBusinessInquiry,
  trackCatalogueSeeAll,
  trackContactSales,
  trackPaywallSelect,
  trackPaywallView,
  trackTemplateFavorite,
  trackTemplateToggle,
  trackTemplateView,
  trackUploadError,
} from './client'
export { AnalyticsIdentify } from './analytics-identify'
export { ExperimentBeacon } from './experiment-beacon'
export { reportExperiments } from './experiments'
export { ConsentSlot } from '../consent-ui/consent-slot'
export { CookieSettingsButton } from '../consent-ui/cookie-settings-button'
export { REPLAY_BLOCK_CLASS } from '../replay'
export { captureAlert, captureError } from './capture'
export { type AlertKind } from '../capture-scope'
export { uploadSizeBucket } from '../event-values'
export { isStaffBrowser, trackGallery } from './gallery'
