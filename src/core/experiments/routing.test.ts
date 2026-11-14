import { describe, expect, it } from 'vitest'

import { OPTION_PAGES, routeExperiment, type RouteInput } from './routing'
import type { ExperimentRegistry, LiveExperiment } from './types'

const registry: ExperimentRegistry = [
  { surface: 'hero', paths: ['/'], options: [{ id: 'tote', label: 'B' }, { id: 'art-style', label: 'A' }], defaultOption: 'tote' },
]
const live: LiveExperiment[] = [
  {
    id: 3,
    surface: 'hero',
    status: 'running',
    winner: null,
    variants: [
      { id: 10, option: 'tote', weight: 50, control: true, archived: false, fallback: null },
      { id: 11, option: 'art-style', weight: 50, control: false, archived: false, fallback: null },
    ],
  },
]
const input = (patch: Partial<RouteInput> = {}): RouteInput => ({
  pathname: '/',
  params: new URLSearchParams(),
  cookie: undefined,
  isBot: false,
  random: () => 0.9,
  allowForce: false,
  ...patch,
})

describe('routeExperiment', () => {
  it('leaves addresses no surface owns alone', () => {
    expect(routeExperiment(input({ pathname: '/pricing' }), live, registry)).toEqual({ option: null, rewrite: null, cookie: null })
  })

  it('serves a new visitor their drawn option from its prerendered page, in their language', () => {
    expect(routeExperiment(input(), live, registry)).toEqual({ option: 'art-style', rewrite: '/x/hero/art-style', cookie: '3.11.11.n' })
    expect(routeExperiment(input({ pathname: '/zh' }), live, registry).rewrite).toBe('/zh/x/hero/art-style')
  })

  it('serves the control as the page itself, without a rewrite', () => {
    expect(routeExperiment(input({ random: () => 0 }), live, registry)).toEqual({ option: 'tote', rewrite: null, cookie: '3.10.10.n' })
  })

  it('keeps a returning visitor without writing the cookie again', () => {
    expect(routeExperiment(input({ cookie: '3.11.11' }), live, registry)).toEqual({ option: 'art-style', rewrite: '/x/hero/art-style', cookie: null })
  })

  it('always gives crawlers the default page and no cookie', () => {
    expect(routeExperiment(input({ isBot: true, cookie: '3.11.11' }), live, registry)).toEqual({ option: 'tote', rewrite: null, cookie: null })
  })

  it('shows today’s page when no experiment is live (kill switch, or the config could not be read)', () => {
    expect(routeExperiment(input(), [], registry)).toEqual({ option: 'tote', rewrite: null, cookie: null })
  })

  it('previews an option for one request only, and ignores unknown options', () => {
    expect(routeExperiment(input({ params: new URLSearchParams('sv_preview=art-style') }), [], registry)).toEqual({ option: 'art-style', rewrite: '/x/hero/art-style', cookie: null })
    expect(routeExperiment(input({ params: new URLSearchParams('sv_preview=nope') }), [], registry).rewrite).toBeNull()
  })

  it('forces a variant only where allowed, flagged so it is never counted', () => {
    const params = new URLSearchParams('sv_exp=tote')
    expect(routeExperiment(input({ params, allowForce: true, cookie: '3.11.11' }), live, registry)).toEqual({ option: 'tote', rewrite: null, cookie: '3.10.10.f' })
    expect(routeExperiment(input({ params, allowForce: false, cookie: '3.11.11' }), live, registry).option).toBe('art-style')
  })

  it('keeps the other experiments in the cookie', () => {
    expect(routeExperiment(input({ cookie: '9.90.90' }), live, registry).cookie).toBe('9.90.90~3.11.11.n')
  })
})

describe('OPTION_PAGES', () => {
  it('matches the option pages in both languages and nothing else', () => {
    expect(['/x/hero/art-style', '/zh/x/hero/a', '/x'].every((path) => OPTION_PAGES.test(path))).toBe(true)
    expect(['/', '/xbox', '/zh/xyz', '/pricing'].some((path) => OPTION_PAGES.test(path))).toBe(false)
  })
})
