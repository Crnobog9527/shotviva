import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PosterSample } from './poster-sample'

const messages = { app: { poster: { sampleAlt: '{name} page {page}', sampleOpen: 'Enlarge {name} page {page}' } } }
const Intl = NextIntlClientProvider as FunctionComponent<{ locale: string; messages: typeof messages; timeZone: string; children?: ReactNode }>
const render = (before: string | null, after: string | null) => renderToStaticMarkup(
  createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' },
    createElement(PosterSample, { name: 'Poster', cover: { type: 'image', before, after, motion: null, poster: null } })),
)

describe('poster sample pages', () => {
  it('offers each page as a separate accessible button', () => {
    const html = render('/first.webp', '/second.webp')
    expect(html).toContain('aria-label="Enlarge Poster page 1"')
    expect(html).toContain('aria-label="Enlarge Poster page 2"')
  })

  it('keeps the original page number when only the second cover exists', () => {
    const html = render(null, '/second.webp')
    expect(html).not.toContain('Enlarge Poster page 1')
    expect(html).toContain('aria-label="Enlarge Poster page 2"')
  })
})
