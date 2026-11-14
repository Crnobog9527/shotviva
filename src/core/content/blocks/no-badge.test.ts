import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { EditCases, ImageRef, ShootDemo } from '../page-content'
import { CompareSlider } from './compare-slider'
import { EditCasesSection } from './edit-cases'
import { PhotoPair } from './photo-pair'
import { ShootSection } from './shoot-section'

// T59 (DESIGN "The No Badge Rule"): no "Illustrative example" / 「示意图」 on any marketing image.
// The disclosure lives in the alt text and the section's caption line, never on the picture.

// The old badge wording sits in the messages on purpose: a component that still renders it fails.
const BADGE_TEXT = 'Illustrative example'
const messages = { marketing: { home: { phone: 'Phone', ai: 'AI', illustrative: BADGE_TEXT } } }
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof messages; timeZone: string }>
const render = (element: ReactElement) => renderToStaticMarkup(createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' }, element))
// Visible text only: tags stripped, so alt attributes (which keep the disclosure) are not counted.
const visible = (html: string) => html.replace(/<[^>]+>/g, ' ')

const img = (name: string): ImageRef => ({ src: `/home/${name}.webp`, alt: `${name} (illustrative example)`, width: 800, height: 1000 })
const shoot: ShootDemo = {
  heading: { lead: 'One photo, ', emphasis: 'a full shoot' },
  intro: 'Intro',
  phone: { image: img('phone'), file: 'IMG_0412.HEIC', caption: 'Your phone photo' },
  arrow: 'Three templates',
  results: [
    { image: img('a'), title: 'A', template: 'A template' },
    { image: img('b'), title: 'B', template: 'B template' },
    { image: img('c'), title: 'C', template: 'C template' },
  ],
  bill: { photographer: { who: 'Photographer', amount: '$300', note: 'n' }, site: { who: 'Shotviva', amount: '$1', note: 'n' }, line: 'line' },
}

const edits: EditCases = {
  heading: 'Change one thing',
  intro: 'Intro',
  labels: { before: 'Before', after: 'After', reference: 'Reference' },
  items: [
    { title: 'A', change: 'a', before: img('a-before'), after: img('a-after') },
    { title: 'B', change: 'b', before: img('b-before'), after: img('b-after'), reference: img('b-ref') },
  ],
}

describe('marketing images carry no badge', () => {
  const cases: [string, ReactElement][] = [
    ['PhotoPair', createElement(PhotoPair, { before: img('before'), after: img('after'), sizes: '50vw' })],
    ['PhotoPair lg', createElement(PhotoPair, { before: img('before'), after: img('after'), size: 'lg', sizes: '50vw' })],
    ['CompareSlider', createElement(CompareSlider, { before: img('before'), after: img('after'), label: 'Compare', sizes: '50vw' })],
    ['ShootSection', createElement(ShootSection, { shoot })],
    ['ShootSection without a bill', createElement(ShootSection, { shoot: { ...shoot, bill: undefined } })],
    ['EditCasesSection', createElement(EditCasesSection, { edits })],
  ]
  it.each(cases)('%s', (_name, element) => {
    const html = render(element)
    expect(html).not.toContain('mk-illus')
    expect(visible(html)).not.toMatch(/Illustrative example/)
    // The alt text still says it.
    expect(html).toContain('(illustrative example)')
  })
})
