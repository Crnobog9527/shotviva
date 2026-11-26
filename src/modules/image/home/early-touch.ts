// A touch on the first-screen card before the page has hydrated (#934, Codex rule 3): the click
// itself is lost, so the random opening must not then change the card under the visitor. This
// tiny listener runs inline with the HTML (home-generator-slot.tsx renders it only when the card
// will shuffle) and leaves a flag on the window that the swap reads (use-random-opening.ts).
export const EARLY_TOUCH_FLAG = 'svGenTouched'

export const EARLY_TOUCH_SCRIPT = `for(const e of["pointerdown","keydown","touchstart","focusin"])addEventListener(e,t=>t.target.closest?.("#gen")&&(self.${EARLY_TOUCH_FLAG}=1),!0)`

export const touchedEarly = (): boolean => typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>)[EARLY_TOUCH_FLAG])
