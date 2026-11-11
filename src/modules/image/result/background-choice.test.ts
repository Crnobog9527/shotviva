import { readFileSync } from 'node:fs'

import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The watermark moment's paywall (T107) is not what these renders check.
vi.mock('@/core/billing/paywall/provider', () => ({ usePaywall: () => ({ open: () => undefined }) }))

import { FormatRow } from '../detail/format-row'
import { BackgroundChoice } from './background-choice'
import ResultActions, { type ResultActionProps } from './result-actions'

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

// The shipped message files, read as files: modules never import site code.
const messages = (locale: 'en' | 'zh') => JSON.parse(readFileSync(`src/site/messages/${locale}.json`, 'utf8'))

async function render(locale: 'en' | 'zh', element: ReactElement) {
  return renderToStaticMarkup(createElement(Intl, { locale, messages: messages(locale), timeZone: 'UTC' }, element))
}

const actions = (work?: ResultActionProps['work']) =>
  createElement(ResultActions, { fileUrl: '/api/files/j1', name: 'shotviva-main', shareText: 'Made with Shotviva', work })

describe('白底 / 透明底 on the result (first render, phone width)', () => {
  it('shows the choice above the primary for a cut-out, white picked first', async () => {
    const html = await render('zh', actions({ pool: 'paid', transparent: true }))
    expect(html).toContain('role="radiogroup" aria-label="背景"')
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?白底.*?JPG/)
    expect(html).toMatch(/aria-checked="false"[^>]*>.*?透明底.*?PNG/)
    expect(html.indexOf('radiogroup')).toBeLessThan(html.indexOf('下载'))
  })

  it('adds nothing for other results', async () => {
    for (const work of [undefined, { pool: 'paid' as const, transparent: false }, { pool: 'free' as const, transparent: null }]) {
      expect(await render('en', actions(work))).not.toContain('radiogroup')
    }
  })

  it('reads in English too, with each segment a 44px target', async () => {
    const html = await render('en', createElement(BackgroundChoice, { value: 'transparent', onChange: () => undefined }))
    expect(html).toContain('aria-label="Background"')
    expect(html).toMatch(/aria-checked="false"[^>]*>.*?White/)
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Transparent/)
    expect(html.match(/min-h-11/g)).toHaveLength(2)
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
