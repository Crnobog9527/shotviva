// A/B experiments (ARCHITECTURE §16.5). Safe for the browser; the proxy and sign-in parts are in
// ./server, the admin's in core/admin/experiments.
export { decideVariant, drawVariant, type Decision } from './assign'
export {
  EXPERIMENT_COOKIE,
  EXPERIMENT_COOKIE_MAX_AGE,
  parseExperimentCookie,
  serializeExperimentCookie,
  type CookieEntry,
  type CookieFlag,
} from './cookie'
export { FORCE_PARAM, OPTION_PAGES, optionPath, PREVIEW_PARAM, routeExperiment, surfaceAt, type RouteInput, type RouteOutcome } from './routing'
export {
  GOALS,
  liveExperimentSchema,
  OPTION_ID,
  STATUSES,
  SURFACES,
  type ExperimentRegistry,
  type Goal,
  type LiveExperiment,
  type LiveVariant,
  type Status,
  type Surface,
  type SurfaceOption,
  type SurfaceRoute,
} from './types'
