import { readFileSync } from 'node:fs'

import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The watermark moment's paywall (T107) is not what these renders check.
vi.mock('@/core/billing/paywall/provider', () => ({ usePaywall: () => ({ open: () => undefined }) }))

import { DetailPhoto } from '../detail/detail-photo'
import { FormatRow } from '../detail/format-row'
import { backgroundForView, viewForBackground } from '../detail/view-chips'
import { ResultPhoto } from './result-photo'
import ResultActions, { type ResultActionProps } from './result-actions'

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

// The shipped message files, read as files: modules never import site code.
const messages = (locale: 'en' | 'zh') => JSON.parse(readFileSync(`src/site/messages/${locale}.json`, 'utf8'))

async function render(locale: 'en' | 'zh', element: ReactElement) {
  return renderToStaticMarkup(createElement(Intl, { locale, messages: messages(locale), timeZone: 'UTC' }, element))
}

const actions = (work?: ResultActionProps['work'], px?: number) =>
  createElement(ResultActions, { fileUrl: '/api/files/j1', name: 'shotviva-main', shareText: 'Made with Shotviva', work, px })

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('a cut-out’s download buttons follow the 白底 / 透明 chips (first render: white)', () => {
  it('names the white file on the primary and offers both files as one ZIP under it', async () => {
    const html = await render('zh', actions({ pool: 'paid', transparent: true }, 1024))
    expect(text(html)).toContain('下载白底图 · 1024 px')
    expect(html).toMatch(/href="\/api\/files\/j1\/both"[^>]*download/)
    expect(text(html)).toContain('下载白底 + 透明图')
    expect(html.indexOf('下载白底图')).toBeLessThan(html.indexOf('下载白底 + 透明图'))
    // No second selector: the photo's chips are the choice.
    expect(html).not.toContain('radiogroup')
  })

  it('reads in English, and a free cut-out gets the same buttons', async () => {
    const html = await render('en', actions({ pool: 'free', transparent: true }, 1024))
    expect(text(html)).toContain('Download white background · 1024 px')
    expect(text(html)).toContain('Download both')
  })

  it('keeps the single plain Download for every other result', async () => {
    for (const work of [undefined, { pool: 'paid' as const, transparent: false }, { pool: 'free' as const, transparent: null }]) {
      const html = await render('zh', actions(work, 1024))
      expect(text(html)).toContain('下载 · 1024 px')
      expect(html).not.toContain('/both')
    }
  })
})

describe('the photo’s chips', () => {
  const detail = (cutOut: boolean | null) =>
    createElement(DetailPhoto, {
      src: '/api/files/j1',
      alt: 'result',
      work: { pool: 'paid', visibility: 'private', cutOut },
      tierLabel: 'Standard · 1024',
      original: { source: { kind: 'deleted' }, alt: 'upload' },
    })

  it('on photo detail: 白底 (pressed) / 透明 / 原图 for a cut-out, 效果图 / 原图 otherwise', async () => {
    const cut = await render('zh', detail(true))
    expect(cut).toMatch(/aria-pressed="true"[^>]*>白底</)
    expect(cut).toMatch(/aria-pressed="false"[^>]*>透明</)
    expect(cut).toMatch(/aria-pressed="false"[^>]*>原图</)
    const plain = await render('zh', detail(false))
    expect(plain).toMatch(/aria-pressed="true"[^>]*>效果图</)
    expect(plain).not.toContain('>透明<')
  })

  it('on the finished result: 白底 / 透明 only, no 原图', async () => {
    const html = await render('en', createElement(ResultPhoto, { src: '/api/files/j1', alt: 'result', pool: 'paid', cutOut: true }))
    expect(html).toMatch(/aria-pressed="true"[^>]*>On white</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Transparent</)
    expect(html).not.toContain('>Original<')
    expect(await render('en', createElement(ResultPhoto, { src: '/api/files/j1', alt: 'result', pool: 'paid', cutOut: false }))).not.toContain('aria-pressed')
  })

  it('maps chips to the download choice; 原图 changes none', () => {
    expect(backgroundForView('result')).toBe('white')
    expect(backgroundForView('checker')).toBe('transparent')
    expect(backgroundForView('original')).toBeNull()
    expect(viewForBackground('transparent', false)).toBe('checker')
    expect(viewForBackground('white', false)).toBe('result')
    expect(viewForBackground('transparent', true)).toBe('original')
  })
})

describe('Format row on photo detail follows the choice', () => {
  const row = (work: ResultActionProps['work'] & object) => createElement(FormatRow, { fileUrl: '/api/files/j1', work, className: 'row' })

  it('names the 白底 JPG while white is picked (the default), and nothing for an opaque work', async () => {
    expect(await render('zh', row({ pool: 'paid', transparent: true }))).toContain('JPG，白底')
    expect(await render('en', row({ pool: 'paid', transparent: true }))).toContain('JPG, white background')
    expect(await render('zh', row({ pool: 'paid', transparent: false }))).toBe('')
  })
})
