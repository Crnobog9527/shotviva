import { expect, it } from 'vitest'
import { requiresAffiliateProgram } from './feature'

it.each(['', '/en', '/zh'])('only exempts the exact localized affiliate introduction (%s)', (prefix) => {
  expect(requiresAffiliateProgram(prefix + '/partners/join')).toBe(false)
  expect(requiresAffiliateProgram(prefix + '/partners/join/')).toBe(false)
  for (const path of ['/partners', '/partners/apply', '/partners/terms', '/partners/join/private']) {
    expect(requiresAffiliateProgram(prefix + path)).toBe(true)
  }
})
