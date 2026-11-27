import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MiSansStylesheet } from './misans-stylesheet'

// /zh's LCP is the hero's inline first frame, painted after the first contentful paint: MiSans
// requested at that paint was charged to the LCP by Lighthouse (3.0 s against 1.4 s FCP, PSI
// 2026-11-21). It waits for the page's load now.
describe('MiSans loader', () => {
  const js = renderToStaticMarkup(createElement(MiSansStylesheet)).replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')

  it('is a valid inline script', () => {
    expect(() => new Function(js)).not.toThrow()
  })

  it('attaches the stylesheet after load and idle (with a fallback), never at the first paint', () => {
    expect(js).toContain("addEventListener('load'")
    expect(js).toContain('requestIdleCallback')
    expect(js).toMatch(/setTimeout\(go,4000\)/)
    expect(js).not.toContain('first-contentful-paint')
  })
})
