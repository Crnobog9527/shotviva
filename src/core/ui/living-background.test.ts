import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { REVEAL_MAX_STEPS, REVEAL_STEP_MS, revealDelays } from './reveal'

const css = readFileSync('src/core/ui/living-background.css', 'utf8')

// DESIGN §5 「全站流动背景」: fixed layers that only ever animate transform and opacity.
describe('living background', () => {
  it('animates nothing but transform and opacity', () => {
    const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)].map((match) => match[1] ?? '')
    expect(keyframes).toHaveLength(4)
    const animated = new Set(keyframes.flatMap((body) => [...body.matchAll(/([a-z-]+):/g)].map((match) => match[1])))
    expect([...animated].sort()).toEqual(['opacity', 'transform'])
  })

  it('sits under every piece of content and turns off under reduced motion', () => {
    expect(css).toMatch(/\.lbg \{[^}]*position: fixed;[^}]*z-index: -1;[^}]*pointer-events: none;/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.lbg \{ display: none; \}/)
  })

  it('is mounted by the marketing and app layouts only, and skips /admin', () => {
    expect(readFileSync('src/app/[locale]/(marketing)/layout.tsx', 'utf8')).toContain('<LivingBackground />')
    expect(readFileSync('src/app/[locale]/(app)/layout.tsx', 'utf8')).toContain('<LivingBackground />')
    expect(readFileSync('src/app/[locale]/(app)/admin/layout.tsx', 'utf8')).not.toContain('LivingBackground')
    expect(readFileSync('src/core/ui/living-background.tsx', 'utf8')).toContain("pathname.startsWith('/admin')")
  })
})

// DESKTOP-NOTES item 6: 40ms apart, at most 8 steps.
describe('revealDelays', () => {
  it('staggers a batch 40ms apart and holds at the eighth step', () => {
    expect(REVEAL_STEP_MS).toBe(40)
    expect(REVEAL_MAX_STEPS).toBe(8)
    expect(revealDelays(3)).toEqual([0, 40, 80])
    expect(revealDelays(10)).toEqual([0, 40, 80, 120, 160, 200, 240, 280, 280, 280])
    expect(revealDelays(0)).toEqual([])
  })
})
