// A touch on the first-screen card before the page has hydrated (#934, Codex rule 3): the click
// itself is lost, so the random opening must not then change the card under the visitor. This
// tiny listener runs inline with the HTML (home-generator-slot.tsx renders it only when the card
// will shuffle) and leaves a flag on the window. The first settled generator to mount takes the
// flag (it belongs to that mount alone) and switches the listener off for the rest of the tab:
// from then on the card's own listeners (use-random-opening.ts) do this job, and a later visit to
// home in the same tab (a client-side navigation) starts clean (#935 review).
export const EARLY_TOUCH_FLAG = 'svGenTouched'
export const EARLY_TOUCH_OFF = 'svGenReady'

export const EARLY_TOUCH_SCRIPT = `for(const e of["pointerdown","keydown","touchstart","focusin"])addEventListener(e,t=>!self.${EARLY_TOUCH_OFF}&&t.target.closest?.("#gen")&&(self.${EARLY_TOUCH_FLAG}=1),!0)`

type Flags = Record<string, unknown>

// Whether the card was touched before this mount; clears the flag and turns the listener off.
export function takeEarlyTouch(): boolean {
  if (typeof window === 'undefined') return false
  const flags = window as unknown as Flags
  const touched = Boolean(flags[EARLY_TOUCH_FLAG])
  flags[EARLY_TOUCH_FLAG] = 0
  flags[EARLY_TOUCH_OFF] = 1
  return touched
}
