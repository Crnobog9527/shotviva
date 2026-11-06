import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NavAccount } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { TranslatedPathsProvider } from '@/core/i18n/ui'

import { site } from '../site.config'
import { loadMessages } from './messages'

async function render(signedIn: boolean, locale: Locale) {
  const nav = createElement(NavAccount, { signedIn })
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: site.locales.zhPaths, children: nav }
  const provider: ComponentProps<typeof NextIntlClientProvider> = { locale, messages: await loadMessages(locale), children: createElement(TranslatedPathsProvider, paths) }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
}

// DESIGN §6.9 item 4: a signed-in visitor sees the way into the app, never Log in.
describe('marketing top bar, account end', () => {
  it('signed out: Log in and Start free, unchanged', async () => {
    const html = await render(false, 'en')
    expect(html).toContain('href="/login"')
    expect(html).toContain('href="/signup"')
    expect(html).toContain('Log in')
    expect(html).not.toContain('/generate')
  })

  it('signed in: Open app to /generate and the account icon, no Log in', async () => {
    const html = await render(true, 'en')
    expect(html).toContain('href="/generate"')
    expect(html).toContain('Open app')
    expect(html).toContain('href="/account"')
    expect(html).toContain('aria-label="Account"')
    expect(html).not.toContain('/login')
    expect(html).not.toContain('Start free')
  })

  it('signed in, Chinese: 进入应用 to /zh/generate and /zh/account', async () => {
    const html = await render(true, 'zh')
    expect(html).toContain('进入应用')
    expect(html).toContain('href="/zh/generate"')
    expect(html).toContain('href="/zh/account"')
  })

  it('carries no user data, only the signed-in state', async () => {
    const html = await render(true, 'en')
    expect(html).not.toMatch(/@|credit/i)
  })
})
