import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from './catalogue-template'
import { CompareSlider } from './compare-slider'
import { PairMedia } from './pair-media'
import { TemplateSample } from './template-sample'

// T59 (DESIGN "The No Badge Rule"): template examples in the app carry no "Illustrative example"
// / 「效果示例」 on the picture; the Create page's caption line says it in text.

// The old badge wording sits in the messages on purpose: a component that still renders it fails.
const BADGE_TEXT = 'Illustrative example'
const messages = { app: { template: { phone: 'Phone', ai: 'AI', example: BADGE_TEXT, phonePhotoAlt: 'Phone photo', compareAria: 'Compare', resultAlt: '{name} result', cardAlt: '{name} example', loopAria: '{name} loop' } } }
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof messages; timeZone: string }>
const render = (element: ReactElement) => renderToStaticMarkup(createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' }, element))
const BADGE = /Illustrative example/

const tpl = (category: string): CatalogueTemplate => ({
  id: 'white-background',
  name: 'White Background',
  category,
  description: null,
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  copyFields: [],
  cover: { type: 'image', before: 'https://assets.test/b.webp', after: 'https://assets.test/a.webp', motion: null, poster: null },
})

describe('template examples carry no badge', () => {
  const cases: [string, ReactElement][] = [
    ['PairMedia card', createElement(PairMedia, { before: 'b.webp', after: 'a.webp', alt: 'x' })],
    ['PairMedia pair', createElement(PairMedia, { before: 'b.webp', after: 'a.webp', alt: 'x', size: 'pair' })],
    ['PairMedia feature', createElement(PairMedia, { before: 'b.webp', after: 'a.webp', alt: 'x', size: 'feature' })],
    ['CompareSlider', createElement(CompareSlider, { before: 'b.webp', after: 'a.webp', afterAlt: 'x' })],
    ['TemplateSample pair', createElement(TemplateSample, { template: tpl('Products & Resale') })],
    ['TemplateSample compare', createElement(TemplateSample, { template: tpl('Art Styles') })],
  ]
  it.each(cases)('%s', (_name, element) => {
    expect(render(element)).not.toMatch(BADGE)
  })
})
