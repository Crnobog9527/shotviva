// Which screenshot the lightbox shows: null while closed. Pure, so the open / step / close rules
// are tested without a browser (graylum-intro.test.ts).
export type LightboxState = { index: number } | null

export type LightboxAction = { type: 'open'; index: number } | { type: 'step'; by: -1 | 1 } | { type: 'close' }

export function lightboxReducer(count: number) {
  return (state: LightboxState, action: LightboxAction): LightboxState => {
    if (action.type === 'close') return null
    if (action.type === 'open') return action.index >= 0 && action.index < count ? { index: action.index } : state
    if (!state) return state
    const next = state.index + action.by
    // The ends stop rather than wrap: the counter "1 / 7" reads as a row, not a ring.
    return next >= 0 && next < count ? { index: next } : state
  }
}

export const canStep = (state: LightboxState, by: -1 | 1, count: number) =>
  state !== null && state.index + by >= 0 && state.index + by < count

// How far down a finger has to drag the lightbox sheet (phones) before letting go closes it.
export const DRAG_TO_CLOSE = 90

// A touch drag counts as pulling the sheet down only when it is mostly downward.
export function pulledDown(dx: number, dy: number): number {
  return dy > 12 && dy > Math.abs(dx) * 1.5 ? dy : 0
}
