// What the Photos page hands the picker: the server action that creates a link. Modules cannot
// import app/ code, so the action comes in as a prop (as the viewer's delete does).
export type CreateShareRequest = { jobIds: string[]; showBefore: boolean; title: string; note: string }
export type CreateShareResult = { path: string } | { failed: 'gone' | 'busy' | 'error' }
export type CreateShareAction = (request: CreateShareRequest) => Promise<CreateShareResult>

export { WORK_SHARE_MAX_WORKS as SHARE_MAX, WORK_SHARE_NOTE_MAX as SHARE_NOTE_MAX, WORK_SHARE_TITLE_MAX as SHARE_TITLE_MAX } from '@/core/work-share/share-schema'

// Deleting the picked works (作品页改版 PR④): the page's server action, and what came of it. A work
// that stayed is counted by why: still generating, an org work (only the org's owner deletes it),
// or an error. Works that are already gone or not the reader's count as deleted: nothing of
// theirs is left to show.
export type BulkDeleteResult = { deleted: number; running: number; org: number; failed: number }
export type BulkDeleteAction = (jobIds: string[]) => Promise<BulkDeleteResult>

// The album view (album-save.ts) showed these works full size for a long-press save: the page's
// server action notes one download for each, as the download route does.
export type BulkSavedAction = (jobIds: string[]) => Promise<void>
