import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('merges conflicting tailwind classes, last wins', () => {
    expect(cn('p-2 text-sm', false && 'hidden', 'p-4')).toBe('text-sm p-4')
  })
})
