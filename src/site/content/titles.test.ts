import { describe, expect, it } from 'vitest'

import { rootMetadata } from '@/core/seo'

import { site } from '../site.config'
import { homePage } from './home'
import { legalPages } from './legal'
import { imageToImageGenerator } from './pages/image-to-image-generator'
import { pricingPage } from './pricing'
import { zhHomePage } from './zh/home'
import { zhImageToImageGenerator } from './zh/pages/image-to-image-generator'
import { zhPricingPage } from './zh/pricing'

// 建站规格 §1: the brand appears exactly once in every Title. Pages below the home page end
// with " | Shotviva" within 60 characters, except the two pricing pages, whose keyword already
// starts with the brand ("shotviva pricing", 「Shotviva 价格」) and so keep it at the start
// (Owner/control 2026-11-06). The home page keeps the keyword Title without the brand (T35).
const SUFFIX = ' | Shotviva'
const suffixed = [imageToImageGenerator, ...legalPages, zhImageToImageGenerator]
const brandFirst = [pricingPage, zhPricingPage]
const brandCount = (title: string) => title.split('Shotviva').length - 1

describe('Title brand suffix', () => {
  it('ends every inner SEO page Title with " | Shotviva", within 60 characters', () => {
    for (const page of suffixed) {
      expect(page.title.endsWith(SUFFIX), page.title).toBe(true)
      expect(page.title.length, page.title).toBeLessThanOrEqual(60)
    }
  })

  it('starts the pricing Titles with the brand and adds no suffix', () => {
    for (const page of brandFirst) {
      expect(page.title.startsWith('Shotviva'), page.title).toBe(true)
      expect(page.title.endsWith(SUFFIX), page.title).toBe(false)
    }
  })

  it('names the brand exactly once in every Title', () => {
    for (const page of [...suffixed, ...brandFirst]) expect(brandCount(page.title), page.title).toBe(1)
  })

  it('leaves the home Titles without the brand', () => {
    expect(homePage.title).not.toContain('Shotviva')
    expect(zhHomePage.title).not.toContain('Shotviva')
  })

  it('adds the suffix to every page that sets a plain title (app, sign-in, admin, 404)', () => {
    expect(rootMetadata(site).title).toEqual({ default: 'Shotviva', template: '%s | Shotviva' })
    expect(rootMetadata(site).appleWebApp).toMatchObject({ title: 'Shotviva', capable: false })
    expect(rootMetadata(site).applicationName).toBe('Shotviva')
  })
})
