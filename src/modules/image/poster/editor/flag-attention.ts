// The short attention cue on the line 去核对 lands on (Owner 2026-11-15): a small shake and a
// highlight pulse, through the Web Animations API so no CSS ships to other pages. With reduced
// motion there is no shake, only the pulse. The field is scrolled to the middle, never focused, so
// a phone's keyboard does not jump up over it.
const SHAKE: Keyframe[] = [0, -6, 6, -4, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)` }))
const PULSE: Keyframe[] = [
  { boxShadow: 'inset 0 0 0 1.5px var(--primary), 0 0 0 0 color-mix(in oklab, var(--primary) 55%, transparent)' },
  { boxShadow: 'inset 0 0 0 1.5px var(--primary), 0 0 0 8px color-mix(in oklab, var(--primary) 0%, transparent)' },
]

export function drawAttention(field: HTMLElement) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  field.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  if (typeof field.animate !== 'function') return
  field.animate(PULSE, { duration: 700, iterations: 2, easing: 'ease-out' })
  if (!reduced) field.animate(SHAKE, { duration: 420, delay: 250, easing: 'ease-in-out' })
}

// The yellow fields a part shows (PosterField marks them aria-invalid), or null when the part is
// not on screen.
export function flaggedFields(fold: string): HTMLElement[] | null {
  const panel = document.getElementById(`poster-${fold.replace(':', '-')}-panel`)
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) : null
}
