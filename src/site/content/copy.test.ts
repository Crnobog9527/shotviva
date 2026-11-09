import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { site } from '../site.config'
import { contentPages, homePage, pricingPage } from './index'
import { FALLBACK_CREDITS, fillCredits } from './credits'
import { freeImagesLabel, fromCredits, tierList, tierPixels, uploadLimits } from './offer'

// The live catalogue on 2026-11-09: Standard costs 1 credit on the cheapest template, more on others.
const LIVE = { from: 1, same: false }
const home = fillCredits(homePage, LIVE)

const allPages = [homePage, ...contentPages]

// Final copy (T11): the strings and numbers 建站规格 §4 / G1 / G3 fix word for word.
describe('home page skeleton', () => {
  it('fixes the home TDK, H1, subtitle and direct answer to 建站规格 §4 / G1', () => {
    expect(homePage.title).toBe('Image to Image AI: Restyle a Photo, Keep the Subject (2026)')
    // T91: the free-image count follows the catalogue, so "that" and "to write" went to keep
    // "Up to 6" within 155 characters and 60 words.
    expect(home.description).toBe(
      'Image to image AI turns a phone photo into a studio shot or a new art style. Pick a template, no prompts, the subject stays as shot. 100 free credits.',
    )
    expect(fillCredits(homePage.description, FALLBACK_CREDITS)).toMatch(/ 100 free credits\.$/)
    expect(homePage.h1).toBe('Image to Image AI: Restyle a Photo, Keep the Subject')
    expect(homePage.subtitle).toBe(
      'The AI photo studio that starts from your real photo. What you shot stays; the template changes the light, the scene or the art style.',
    )
    expect(home.answerBlock).toBe(
      'Image to image AI takes a photo you already have and gives it a new look while the subject stays as shot. With Shotviva you upload one phone photo, pick a template for food, products, rooms, pets or an art style, and download it in Standard, HD or Max. No prompts. New users get 100 free credits.',
    )
  })

  it('follows the six-H2 home skeleton in order', () => {
    expect([
      homePage.steps.heading,
      homePage.templateGrid.heading,
      homePage.headings.facts,
      homePage.freeOffer.heading,
      homePage.headings.faq,
      homePage.headings.related,
    ]).toEqual([
      'How Image to Image AI Works in 3 Steps',
      'Img to Img Templates: No Prompts to Write',
      'Why Choose Shotviva for AI Image to Image',
      'Free Image to Image AI: What You Get',
      'Image to Image AI FAQ',
      'Image to Image AI for Food, Products, Rooms and More',
    ])
    expect(homePage.steps.items.map((step) => step.heading)).toEqual([
      'Upload One Photo',
      'Pick a Template',
      'Download in Standard, HD or Max',
    ])
    expect(home.freeOffer.points[0].heading).toBe('100 Free Credits When You Sign Up')
    expect(fillCredits(homePage, FALLBACK_CREDITS).freeOffer.points[0].heading).toBe('100 Free Credits When You Sign Up')
  })
})

describe('public numbers', () => {
  it('counts the 6 free credits in Standard images at the catalogue price (建站规格 G3, T91)', () => {
    expect(site.billing.freeCredits).toBe(100)
    // Filled from the catalogue at render time (credits.test.ts).
    expect(fillCredits(freeImagesLabel, LIVE)).toBe('100 free credits')
    expect(fillCredits(fromCredits, LIVE)).toBe('from 1 credit')
    expect(tierList).toBe('Standard, HD or Max')
    expect(tierPixels).toBe('Standard 1024 px, HD 2048 px, Max 2880 px')
    expect(uploadLimits).toBe('JPG, PNG or WebP, up to 20MB')
  })

  it('keeps the TDK limits on /pricing and audiences out of general Titles and H1s', () => {
    expect(pricingPage.title.length).toBeLessThanOrEqual(60)
    expect(fillCredits(pricingPage.description, LIVE).length).toBeLessThanOrEqual(155)
    // Vertical pages (建站规格 §4: /ai-restaurant-menu) may name their audience; general pages may not.
    for (const page of allPages.filter((p) => !p.keyword.includes('restaurant'))) expect(`${page.title} ${page.h1}`).not.toMatch(/restaurant/i)
  })

  it('never says 1K / 2K / 3K / 4K or hard-codes a price in page copy (G3)', () => {
    const dir = join(process.cwd(), 'src', 'site', 'content')
    // offer.ts is the one place numbers are read and is left out on purpose.
    const files = ['home.ts', 'shared.ts', 'pricing.ts', ...readdirSync(join(dir, 'pages')).map((f) => `pages/${f}`)]
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/\$\d/)
      expect(source, file).not.toMatch(/\b[1-4]K\b/)
    }
  })
})
