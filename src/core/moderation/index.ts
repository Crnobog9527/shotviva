// Content moderation for the public gallery (ARCHITECTURE §9 第 5、8 条, T108).
export { liveModerationDeps, moderationKey, needsScreen, scheduleScreen } from './live'
export { screenWork, type ModerationDeps, type ScreenRow } from './moderate-work'
export { MODERATION_MODEL, screenWithOpenAI, verdictOf, type ScreenVerdict } from './openai-screen'
export {
  MODERATION_STATUSES,
  REJECT_REASONS,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type ModerationStatus,
  type RejectReason,
  type ReportReason,
} from './reasons'
export { moderateInputSchema, moderateWorks, recordScreenFailure, reportInputSchema, reportWork, type ModerateInput, type ReportInput, type ReportOutcome } from './rpc'
export { submitReport } from './report'
export { MAX_SCREEN_ATTEMPTS, RETRY_AFTER_MINUTES, sweepModeration, SWEEP_LIMIT, type SweepResult } from './sweep'
