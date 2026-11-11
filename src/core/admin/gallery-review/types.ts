// Shared with the client review page, so no server-only import here (ARCHITECTURE §9 第 5 条).

export const REVIEW_TABS = ['pending', 'reported', 'approved', 'rejected'] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

export type ReviewWork = {
  id: string
  // A 10-minute signed URL of the finished image; null when it could not be signed.
  imageUrl: string | null
  templateId: string
  templateName: string
  createdAt: string
  creditPool: 'free' | 'paid'
  status: 'pending' | 'approved' | 'rejected'
  reason: string | null
  categories: string[]
  // When the automatic screen saw it; null while it has not (no key, or a failed call).
  screenedAt: string | null
  moderatedAt: string | null
  // The text the work page would show (the screen saw the same).
  copy: string[]
  reports: { count: number; reasons: string[] }
}

export type ReviewPage = { tab: ReviewTab; works: ReviewWork[]; next: string | null }
