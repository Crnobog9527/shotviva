import 'server-only'

// No face swap (ARCHITECTURE §5.1a, T81): only the words a user typed are judged, before credits.
export { identityRefusalCounts, REFUSAL_FLAG_24H, type RefusalCounts } from './admin-counts'
export {
  IDENTITY_ENTRIES,
  REFUSAL_METHODS,
  type IdentityEntry,
  type IdentityJudge,
  type IdentityJudgeAnswer,
  type IdentityJudgeUsage,
  type RefusalMethod,
} from './judge'
export { matchIdentitySwapKeyword } from './keywords'
export { IDENTITY_EDIT_ADDENDUM, IDENTITY_JUDGE_INSTRUCTIONS } from './question'
export { EXCERPT_MAX, excerptOf, IdentitySwapRefused, refuseIdentitySwap, type Refusal, type RefusalDeps } from './refuse'
export { IDENTITY_JUDGE_TIMEOUT_MS, screenIdentityText, userText, type ScreenDeps, type ScreenInput, type ScreenResult } from './screen'
