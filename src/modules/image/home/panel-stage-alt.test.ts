import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PanelStage } from './panel-stage'

const messages = {
  home: { generator: { stageAlt: '{name} result', yourPhoto: 'Your photo' } },
  marketing: { home: { ai: 'AI', beforeAlt: '{name} original example' } },
}
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof messages; timeZone: string }>
const render = (mine: boolean) => renderToStaticMarkup(createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' },
  createElement(PanelStage, { name: 'Portrait', after: null, initial: null, inset: { url: '/example.jpg', ratio: 1, label: 'Phone', mine } }),
))

describe('generator original photo', () => {
  it('describes the template example', () => expect(render(false)).toContain('alt="Portrait original example"'))
  it('identifies the visitor’s uploaded photo', () => expect(render(true)).toContain('alt="Your photo"'))
})
