import type { FormAction } from './use-auth-form'

// The Google button on the sign-in pages: its server action, and whether the line saying it does
// not load in mainland China goes under it (decided on the server, see google-mainland-note.tsx).
export type GoogleProps = { action: FormAction; mainlandNote: boolean }
