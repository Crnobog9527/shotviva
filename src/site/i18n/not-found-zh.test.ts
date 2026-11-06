import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NotFoundView } from '@/core/content'
import { TranslatedPathsProvider } from '@/core/i18n/ui'

import { site } from '../site.config'
import { loadMessages } from './messages'

// The page the proxy rewrites unknown /zh addresses to (ARCHITECTURE §17: a Chinese 404).
describe('404 page in Chinese', () => {
  it('reads Chinese and links to the Chinese home and templates', async () => {
    const pathsProps: ComponentProps<typeof TranslatedPathsProvider> = { paths: site.locales.zhPaths, children: createElement(NotFoundView) }
    const view = createElement(TranslatedPathsProvider, pathsProps)
    const provider: ComponentProps<typeof NextIntlClientProvider> = { locale: 'zh', messages: await loadMessages('zh'), children: view }
    const html = renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
    expect(html).toContain('页面不存在')
    expect(html).toContain('href="/zh"')
    expect(html).toContain('href="/zh/generate"')
    expect(html).not.toMatch(/does not exist/i)
  })
})
