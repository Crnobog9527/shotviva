import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { CompareSlider as CompareSliderType } from './compare-slider'
import type { PairMedia as PairMediaType } from './pair-media'

// Covers load at the size they are shown (core/ui/cover-image): the catalogue's <img>s carry the
// optimiser's srcset and the slot's sizes, keep their alt text, and a user's own photo (the
// result page's compare) is left as given.

const BASE = 'https://shotviva.com/assets'
const BEFORE = `${BASE}/covers/white-background/before-4b7a8865edb03132.webp`
const AFTER = `${BASE}/covers/white-background/after-4f8f56a3c746fd2b.webp`
const messages = { app: { template: { phone: 'Phone', ai: 'AI', phonePhotoAlt: 'Phone photo', compareAria: 'Compare' } } }
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof messages; timeZone: string }>
const render = (element: ReactElement) => renderToStaticMarkup(createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' }, element))
const imgs = (html: string) => html.match(/<img [^>]*>/g) ?? []

let PairMedia: typeof PairMediaType
let CompareSlider: typeof CompareSliderType

beforeAll(async () => {
  // public-env reads the base when it is first imported.
  vi.stubEnv('NEXT_PUBLIC_ASSETS_BASE_URL', BASE)
  ;({ PairMedia } = await import('./pair-media'))
  ;({ CompareSlider } = await import('./compare-slider'))
})

describe('covers in the catalogue go through the optimiser', () => {
  it('PairMedia: every plate has the srcset and the plate width as sizes; the result keeps its alt', () => {
    const html = render(createElement(PairMedia, { before: BEFORE, after: AFTER, alt: 'Studio Product Shot example', sizes: '(min-width: 1024px) 182px, 50vw' }))
    const tags = imgs(html)
    expect(tags).toHaveLength(3)
    for (const tag of tags) {
      expect(tag).toContain('sizes="(min-width: 1024px) 182px, 50vw"')
      expect(tag).toMatch(/srcSet="\/_next\/image\?url=https%3A%2F%2Fshotviva\.com%2Fassets%2Fcovers%2F[^"]+ 384w/)
      expect(tag).not.toContain(`src="${BEFORE}"`)
    }
    expect(tags[2]).toContain('alt="Studio Product Shot example"')
    expect(tags.every((tag) => tag.includes('loading="lazy"'))).toBe(true)
  })

  it('CompareSlider: covers get the srcset (lazy when asked), a user’s own photos stay as they are', () => {
    const cover = imgs(render(createElement(CompareSlider, { before: BEFORE, after: AFTER, afterAlt: 'Result', cover: { sizes: '440px', lazy: true } })))
    expect(cover).toHaveLength(2)
    expect(cover.every((tag) => tag.includes('sizes="440px"') && tag.includes('srcSet="/_next/image?') && tag.includes('loading="lazy"'))).toBe(true)
    expect(cover[0]).toContain('alt="Phone photo"')

    const own = imgs(render(createElement(CompareSlider, { before: 'blob:https://shotviva.com/1', after: '/api/files/job-1', afterAlt: 'Result' })))
    expect(own[0]).toContain('src="blob:https://shotviva.com/1"')
    expect(own[1]).toContain('src="/api/files/job-1"')
    expect(own.some((tag) => tag.includes('srcSet') || tag.includes('loading='))).toBe(false)
  })
})
