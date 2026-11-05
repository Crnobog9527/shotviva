import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('merges conflicting tailwind classes, last wins', () => {
    expect(cn('p-2 text-sm', false && 'hidden', 'p-4')).toBe('text-sm p-4')
  })
})

describe('cn with the Darkroom theme', () => {
  it('keeps a named font size next to a text colour', () => {
    expect(cn('text-sm text-foreground', 'text-caption')).toBe('text-foreground text-caption')
  })

  it('lets a named radius replace a default one', () => {
    expect(cn('rounded-md', 'rounded-tile')).toBe('rounded-tile')
  })
})
