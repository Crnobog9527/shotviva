import 'server-only'

// No face swap (ARCHITECTURE §5.1a, T81): only the words a user typed are judged, before credits.
export { identityJudgeStats, identityRefusalCounts, REFUSAL_FLAG_24H, type JudgeStats, type RefusalCounts } from './admin-counts'
export {
  IDENTITY_ENTRIES,
  REFUSAL_METHODS,
  type IdentityEntry,
  type IdentityJudge,
  type IdentityJudgeAnswer,
  type IdentityJudgeUsage,
  type RefusalMethod,
} from './judge'
export { IDENTITY_JUDGE_ATTEMPTS, IDENTITY_JUDGE_TIMEOUT_MS, isRetryable, JudgeFailure, judgeWithin, judgeWithRetry } from './judge-call'
export { FAIL_OPEN_LOG, JUDGE_CALLS_PER_HOUR, keepVerdict, markJudgeFailed, takeJudgeSlot, textHash, type JudgeSlot } from './judge-slots'
export { IDENTITY_EDIT_ADDENDUM, IDENTITY_JUDGE_INSTRUCTIONS, IDENTITY_PROMPT_VERSION } from './question'
export { EXCERPT_MAX, excerptOf, IdentitySwapRefused, refuseIdentitySwap, type Refusal, type RefusalDeps } from './refuse'
export {
  screenIdentityText,
  tooManyJudgeCalls,
  userFields,
  userText,
  type ScreenDeps,
  type ScreenInput,
  type ScreenResult,
} from './screen'
