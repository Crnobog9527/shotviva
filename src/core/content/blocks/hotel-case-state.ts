// What each side of a case in the hotels viewer shows, and the note under the pair (pure, so the
// states are tested without a browser: hotel-case-state.test.ts).
//   waiting  the thumbnail on a pulsing plate: the full-size picture is on its way
//   shown    the full-size picture has loaded and fades in over the thumbnail
//   broken   the thumbnail stays, still: the pictures' request failed, or this picture did
export type PictureStatus = 'waiting' | 'shown' | 'broken'
export type CaseNote = 'loading' | 'failed' | null

type Seen = { requestFailed: boolean; shown: ReadonlySet<string>; broken: ReadonlySet<string> }

export function pictureStatus(src: string | undefined, { requestFailed, shown, broken }: Seen): PictureStatus {
  if (src && shown.has(src)) return 'shown'
  if (requestFailed || (src !== undefined && broken.has(src))) return 'broken'
  return 'waiting'
}

// A failure anywhere in the case wins (with its retry), then loading while either side waits.
export function caseNote(statuses: readonly PictureStatus[]): CaseNote {
  if (statuses.includes('broken')) return 'failed'
  if (statuses.includes('waiting')) return 'loading'
  return null
}
