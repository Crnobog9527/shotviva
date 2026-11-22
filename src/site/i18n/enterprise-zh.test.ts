import { NextIntlClientProvider } from 'next-intl'
import { NextRequest, NextResponse } from 'next/server'
import { createElement, type ComponentProps, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { proxyGate } from '@/core/auth/proxy-gates'
import type { Locale } from '@/core/i18n'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { OrgTabs, OwnerEntryRow } from '@/core/org/ui'

import { site } from '../site.config'
import { loadMessages } from './messages'

async function render(node: ReactElement, locale: Locale) {
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: site.locales.zhPaths, children: node }
  const provider: ComponentProps<typeof NextIntlClientProvider> = { locale, messages: await loadMessages(locale), children: createElement(TranslatedPathsProvider, paths) }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
}

// QA 2026-11-22: /zh/account/enterprise was a 404, so Chinese org owners could not reach their console.
describe('the enterprise owner console in Chinese', () => {
  it('has a /zh twin, so the proxy hands /zh/account/enterprise to sign-in instead of the 404 page', async () => {
    const forward = (request: NextRequest) => NextResponse.next({ request })
    const response = await proxyGate(new NextRequest('http://localhost:3000/zh/account/enterprise'), { translatedPaths: site.locales.zhPaths, forward })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/zh/login?next=')
  })

  it('links to /zh/account/enterprise from the account row and both tabs, in Chinese', async () => {
    const zh = await render(createElement('div', null, createElement(OwnerEntryRow, { name: 'Org', pool: '0', suspended: false }), createElement(OrgTabs, { current: 'console', affiliate: true })), 'zh')
    expect(zh.match(/href="\/zh\/account\/enterprise"/g)).toHaveLength(2)
    expect(zh).toContain('href="/zh/partners/enterprise"')
    expect(zh).not.toContain('href="/account/enterprise"')
    const en = await render(createElement(OrgTabs, { current: 'console', affiliate: true }), 'en')
    expect(en).toContain('href="/account/enterprise"')
  })
})
