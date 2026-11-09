import { describe, expect, it } from 'vitest'

import { testSite, withImageOff } from '../seo/test-site'
import { isPathEnabled, moduleForPath } from './modules'
import { requireModule } from './navigation'

// AGENTS §7 item 5: a disabled module's routes 404.
describe('module switch', () => {
  it('maps /generate and its sub-paths to the image module', () => {
    expect(moduleForPath('/generate')).toBe('image')
    expect(moduleForPath('/generate/abc')).toBe('image')
    expect(moduleForPath('/generated-art')).toBeUndefined()
    expect(moduleForPath('/pricing')).toBeUndefined()
  })

  it('lets the route render when the module is on', () => {
    expect(() => requireModule(testSite(), 'image')).not.toThrow()
    expect(isPathEnabled(testSite(), '/generate')).toBe(true)
  })

  it('throws the Next.js 404 when the module is off', () => {
    const off = withImageOff(testSite())
    expect(isPathEnabled(off, '/generate')).toBe(false)
    expect(() => requireModule(off, 'image')).toThrow(
      expect.objectContaining({ digest: expect.stringContaining('404') }),
    )
  })
})
