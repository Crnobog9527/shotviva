import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SiteImage } from './site-image'
import { StaticSiteImage } from './static-site-image'

describe('static marketing images', () => {
  it('preserves the optimized attributes with explicit and default lazy loading', () => {
    const image = { src: '/home/hero-set-phone.webp', alt: 'A bag', width: 900, height: 1125, sizes: '(min-width: 1024px) 236px, 50vw' }
    for (const props of [image, { ...image, loading: 'lazy' as const }]) {
      expect(renderToStaticMarkup(createElement(StaticSiteImage, props))).toBe(renderToStaticMarkup(createElement(SiteImage, props)))
    }
  })
})
