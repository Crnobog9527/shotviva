import type { ReviewInput } from '../schema'

// Same shape as core/admin's ActionResult, so the page can wrap the action with runAdminAction.
export type ReviewResult = { ok: true } | { ok: false; code: string; message: string }

export type ReviewActions = { review: (input: ReviewInput) => Promise<ReviewResult> }

export type TemplateOption = { id: string; name: string }
