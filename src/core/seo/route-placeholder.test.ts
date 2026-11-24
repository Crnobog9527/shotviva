import { describe, expect, it } from 'vitest'

import { isRoutePlaceholderPath } from './route-placeholder'

describe('isRoutePlaceholderPath', () => {
  it('matches a route placeholder segment, raw or percent-encoded', () => {
    expect(isRoutePlaceholderPath('/join/org/[token]')).toBe(true)
    expect(isRoutePlaceholderPath('/join/org/%5Btoken%5D')).toBe(true)
    expect(isRoutePlaceholderPath('/blog/%5bslug%5d')).toBe(true)
    expect(isRoutePlaceholderPath('/zh/photos/[jobId]')).toBe(true)
    expect(isRoutePlaceholderPath('/[locale]/pricing')).toBe(true)
    expect(isRoutePlaceholderPath('/docs/[...slug]')).toBe(true)
    expect(isRoutePlaceholderPath('/docs/[[...slug]]')).toBe(true)
  })

  it('leaves real addresses alone', () => {
    expect(isRoutePlaceholderPath('/')).toBe(false)
    expect(isRoutePlaceholderPath('/join/org/0123456789abcdef0123456789abcdef')).toBe(false)
    expect(isRoutePlaceholderPath('/zh/blog/best-ai-photo-editor')).toBe(false)
    expect(isRoutePlaceholderPath('/generate/cn-warm-soup-glass')).toBe(false)
    expect(isRoutePlaceholderPath('/blog/a[b]')).toBe(false)
    expect(isRoutePlaceholderPath('/blog/[1]')).toBe(false)
  })
})
