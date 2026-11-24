import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const { HoldCovers } = await import('./hold-covers')
const { PairMedia } = await import('./pair-media')

const pair = (eager: boolean) => createElement(PairMedia, { before: 'https://x/covers/a/before.webp', after: 'https://x/covers/a/after.webp', alt: 'A', eager, sizes: '50vw' })
const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? []

describe('shelf covers wait for the first shelf (2026-11-25)', () => {
  it('holds a card that is not on the first screen', () => {
    expect(imgs(renderToStaticMarkup(createElement(HoldCovers, { held: true }, pair(false))))).toEqual([])
  })

  it('never holds a first-screen card, and lets the rest go once released', () => {
    expect(imgs(renderToStaticMarkup(createElement(HoldCovers, { held: true }, pair(true)))).length).toBeGreaterThan(0)
    expect(imgs(renderToStaticMarkup(createElement(HoldCovers, { held: false }, pair(false)))).length).toBeGreaterThan(0)
  })
})
