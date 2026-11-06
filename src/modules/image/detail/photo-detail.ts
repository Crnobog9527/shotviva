import type { Job } from '@/core/jobs'
import type { Translate } from '@/core/translate'

// What the photo page shows beyond the result itself (T32): the user's upload and their note.
// An edit (T30) has no upload: its "Original" is the work it was edited from ('source').
// keptWithWork: the full upload is kept next to the result for Make again (T40); works made
// before that only have the preview, or nothing.
export type OriginalSource = { kind: 'preview'; url: string } | { kind: 'source'; url: string } | { kind: 'deleted' }
export type PhotoDetail = { note: string | null; original: OriginalSource; keptWithWork: boolean }

// Only what the user typed into "Anything to change?", exactly as typed. The wrapper prompt is
// never stored in inputs (ARCHITECTURE §4), and no other input field is read here, so nothing
// of ours can reach the page through this.
export function noteOf(inputs: Record<string, unknown>): string | null {
  const note = inputs.note
  return typeof note === 'string' && note.trim() !== '' ? note.trim() : null
}

export function toPhotoDetail(job: Pick<Job, 'inputs'>, previewUrl: string | null, keptWithWork = false): PhotoDetail {
  return {
    note: noteOf(job.inputs),
    original: previewUrl ? { kind: 'preview', url: previewUrl } : { kind: 'deleted' },
    keptWithWork,
  }
}

// Calendar day of `date` in `timeZone`, as a day count (so "yesterday" is a difference of 1).
function dayIndex(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Math.round(Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000)
}

// "Today" / "Yesterday" / the locale's short date, counted in the viewer's own time zone.
// `t` is scoped to app.result.when.
export function dayLabel(created: Date, now: Date, timeZone: string, t: Translate, formatDay: (date: Date) => string): string {
  const days = dayIndex(now, timeZone) - dayIndex(created, timeZone)
  if (days <= 0) return t('today')
  return days === 1 ? t('yesterday') : formatDay(created)
}
