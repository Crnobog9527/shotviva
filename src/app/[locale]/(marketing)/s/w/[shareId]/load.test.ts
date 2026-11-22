import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { ctaHref } = await import('./load')

describe('the shared page action', () => {
  it("keeps the sharer's affiliate code on the home link", () => {
    expect(ctaHref('en', 'chef-ann')).toBe('/?ref=chef-ann')
    expect(ctaHref('zh', 'chef-ann')).toBe('/zh?ref=chef-ann')
    expect(ctaHref('en', null)).toBe('/')
  })
})
