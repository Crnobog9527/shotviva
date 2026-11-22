import { readFileSync } from 'node:fs'

import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/billing/paywall/provider', () => ({ usePaywall: () => ({ open: () => undefined }) }))

import ResultActions, { type ResultActionProps } from './result-actions'

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>
const messages = (locale: 'en' | 'zh') => JSON.parse(readFileSync(`src/site/messages/${locale}.json`, 'utf8'))
const text = (html: string) => html.replace(/<[^>]+>/g, '')

const render = (locale: 'en' | 'zh', props: Partial<ResultActionProps>) =>
  renderToStaticMarkup(
    createElement(Intl, { locale, messages: messages(locale), timeZone: 'UTC' }, createElement(ResultActions, { fileUrl: '/api/files/j1', name: 'shotviva-main', shareText: 'Made with Shotviva', px: 1024, ...props })),
  )

const create = async () => ({ path: '/s/w/abc' })

describe('「分享」 on the finished result (Owner 2026-11-23)', () => {
  it('sits beside Download from the first paint when a share link can be made, on phones and desktop', () => {
    const html = render('zh', { link: { jobId: 'j1', create }, watermarked: true, work: { pool: 'free', transparent: false } })
    expect(text(html)).toContain('下载 · 1024 px')
    expect(html).toMatch(/<button[^>]*>.*<span>分享<\/span><\/button>/)
    // Shown from lg too (not lg:hidden), and Download stays first.
    expect(html).not.toMatch(/<button[^>]*lg:hidden/)
    expect(html.indexOf('下载')).toBeLessThan(html.indexOf('>分享<'))
    expect(render('en', { link: { jobId: 'j1', create } })).toContain('<span>Share</span>')
  })

  it('is absent before the file is ready where no link can be made (unchanged)', () => {
    const html = render('zh', {})
    expect(html).not.toContain('分享')
    expect(text(html)).toContain('长按保存')
  })
})
