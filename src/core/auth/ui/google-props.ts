import type { FormAction } from './use-auth-form'

// The Google button on the sign-in pages: its server action, and whether the line saying it does
// not load in mainland China goes under it (google-mainland-note.tsx): yes, no, or 'zone' = the
// static HTML decides by the browser's time zone before the first paint.
export type GoogleProps = { action: FormAction; mainlandNote: boolean | 'zone' }
