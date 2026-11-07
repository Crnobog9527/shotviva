import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PAGE_ENTER, PAGE_EXIT } from '../app-shell/app-frame'
import { appPath, navMotion } from './nav-motion'

// DESIGN §8.2 「页面切换过渡」 (T56): which way a page moves, and what the CSS may animate.
describe('page transition direction', () => {
  it('pushes into a flow page and pops back out of it', () => {
    expect(navMotion('/generate', '/generate/pure-white')).toBe('nav-forward')
    expect(navMotion('/photos', '/photos/0c39344e')).toBe('nav-forward')
    expect(navMotion('/account', '/account/help')).toBe('nav-forward')
    expect(navMotion('/account/help', '/account/help/new')).toBe('nav-forward')
    expect(navMotion('/photos/0c39344e', '/photos')).toBe('nav-back')
    expect(navMotion('/generate/pure-white?again=1', '/generate')).toBe('nav-back')
    expect(navMotion('/account/help/new', '/account/help')).toBe('nav-back')
  })

  it('cross-fades between tab roots and keeps going forward between flow pages', () => {
    expect(navMotion('/generate', '/photos')).toBe('nav-tab')
    expect(navMotion('/photos/', '/account')).toBe('nav-tab')
    // A finished edit opens the new photo; Make again opens the workspace.
    expect(navMotion('/photos/a', '/photos/b')).toBe('nav-forward')
    expect(navMotion('/photos/a', '/generate/pure-white?again=a')).toBe('nav-forward')
  })

  it('reads the Chinese pages the same way', () => {
    expect(appPath('/zh/photos/1?x=1#y')).toBe('/photos/1')
    expect(appPath('/zh')).toBe('/')
    expect(navMotion('/zh/photos', '/photos/1')).toBe('nav-forward')
    expect(navMotion('/zh/generate/pure-white', '/generate')).toBe('nav-back')
  })

  it('switches instantly outside the app, and on the same page', () => {
    expect(navMotion('/', '/generate')).toBeNull()
    expect(navMotion('/generate', '/pricing')).toBeNull()
    expect(navMotion('/admin', '/admin/users')).toBeNull()
    expect(navMotion('/account', '/checkout')).toBeNull()
    expect(navMotion('/photos', '/photos?sent=1')).toBeNull()
    expect(navMotion('/wishlist/new', '/wishlist?sent=1')).toBe('nav-back')
  })

  it('maps every type to an entering and a leaving class, and nothing else animates', () => {
    expect(PAGE_ENTER).toEqual({ 'nav-forward': 'push-in', 'nav-back': 'pop-in', 'nav-tab': 'tab-in', default: 'none' })
    expect(PAGE_EXIT).toEqual({ 'nav-forward': 'push-out', 'nav-back': 'pop-out', 'nav-tab': 'tab-out', default: 'none' })
  })
})

describe('page transition CSS', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const block = css.slice(css.indexOf('/* Page transitions between app pages'), css.indexOf('/* One-shot entry fade'))

  it('animates only transform and opacity, never past 300ms', () => {
    const keyframes = [...block.matchAll(/@keyframes (sv-page-[\w-]+) \{([^}]*)\}/g)]
    expect(keyframes).toHaveLength(6)
    const props = new Set(keyframes.flatMap((match) => [...(match[2] ?? '').matchAll(/([a-z-]+):/g)].map((prop) => prop[1])))
    expect([...props].sort()).toEqual(['opacity', 'transform'])
    const durations = [...block.matchAll(/animation: sv-page-[\w-]+ (\d+)ms/g)].map((match) => Number(match[1]))
    expect(durations.length).toBeGreaterThan(0)
    expect(Math.max(...durations)).toBeLessThanOrEqual(300)
    expect(block).toMatch(/::view-transition-new\(\.tab-in\) \{ animation: sv-page-fade-in 150ms/)
  })

  it('keeps the bars still and turns everything off under reduced motion', () => {
    expect(block).toMatch(/::view-transition-old\(app-tabs\) \{ display: none; \}/)
    expect(block).toMatch(/::view-transition-new\(app-tabs\) \{ animation: none; \}/)
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*::view-transition-new\(\*\) \{ animation: none !important; \}/)
    expect(readFileSync('src/core/app-shell/tab-bar.tsx', 'utf8')).toContain("viewTransitionName: 'app-tabs'")
    expect(readFileSync('src/core/app-shell/flow-nav.tsx', 'utf8')).toContain("viewTransitionName: 'app-flow-nav'")
  })
})
