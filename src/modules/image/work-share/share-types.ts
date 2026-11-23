// What the Photos page hands the picker: the server action that creates a link. Modules cannot
// import app/ code, so the action comes in as a prop (as the viewer's delete does).
export type CreateShareRequest = { jobIds: string[]; showBefore: boolean; title: string; note: string }
export type CreateShareResult = { path: string } | { failed: 'gone' | 'busy' | 'error' }
export type CreateShareAction = (request: CreateShareRequest) => Promise<CreateShareResult>

export { WORK_SHARE_MAX_WORKS as SHARE_MAX, WORK_SHARE_NOTE_MAX as SHARE_NOTE_MAX, WORK_SHARE_TITLE_MAX as SHARE_TITLE_MAX } from '@/core/work-share/share-schema'
