// Plain lists shared with client components (the review page, the report form). ARCHITECTURE §9.1.
export const MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type ModerationStatus = (typeof MODERATION_STATUSES)[number]

export const REJECT_REASONS = ['sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'quality', 'other'] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

export const REPORT_REASONS = ['sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]
export const REPORT_NOTE_MAX = 500
