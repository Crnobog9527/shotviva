import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PanelStage } from './panel-stage'

const en = { home: { generator: { stageAlt: '{name} result', yourPhoto: 'Your photo' } }, marketing: { home: { ai: 'AI', beforeAlt: '{name} template, real example: the phone photo before' } } }
const zh = { home: { generator: { stageAlt: '{name}成品', yourPhoto: '你的照片' } }, marketing: { home: { ai: 'AI', beforeAlt: '{name}模板真实案例：手机原图' } } }
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof en | typeof zh; timeZone: string }>
const render = (mine: boolean, locale: 'en' | 'zh') => renderToStaticMarkup(createElement(Intl, { locale, messages: locale === 'en' ? en : zh, timeZone: 'UTC' },
  createElement(PanelStage, { name: 'Portrait', after: null, initial: null, inset: { url: '/example.jpg', ratio: 1, label: 'Phone', mine } }),
))

describe('generator original photo', () => {
  it('describes the template example in both languages', () => {
    expect(render(false, 'en')).toContain('alt="Portrait template, real example: the phone photo before"')
    expect(render(false, 'zh')).toContain('alt="Portrait模板真实案例：手机原图"')
  })
  it('identifies the visitor’s uploaded photo in both languages', () => {
    expect(render(true, 'en')).toContain('alt="Your photo"')
    expect(render(true, 'zh')).toContain('alt="你的照片"')
  })
})
