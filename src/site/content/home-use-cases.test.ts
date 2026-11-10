import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NavMenu } from '@/core/content/blocks/nav-menu'
import { TopicCards } from '@/core/content/blocks/topic-section'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { loadMessages } from '@/site/i18n/messages'

import { homePage } from './home'

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement) {
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: ['/'], children: element }
  const inner = createElement(TranslatedPathsProvider, paths)
  return renderToStaticMarkup(createElement(Intl, { locale: 'en', messages: await loadMessages('en'), timeZone: 'UTC' }, inner))
}

// SEO launch handbook G5: the use-case H2 links each landing page from <main> with its keyword.
describe('home use cases', () => {
  it('has the G5 heading and three cards linking the landing pages by keyword', async () => {
    const topics = homePage.topics!
    expect(topics.heading).toBe('What People Use Image to Image AI For')
    const html = await render(createElement(TopicCards, { topic: topics, isLinkEnabled: () => true }))
    expect(html.match(/<h3>/g)).toHaveLength(3)
    expect(html).toContain('<a href="/ai-restaurant-menu">AI restaurant menu photos</a>.')
    expect(html).toContain('<a href="/commercial-photography">commercial photography</a>.')
    expect(html).toContain('<a href="/image-to-image-generator">image to image generator</a>.')
  })
})

describe('top-bar Use Cases menu', () => {
  it('is a closed disclosure whose links are already in the HTML', async () => {
    const links = [
      { href: '/ai-restaurant-menu', label: 'AI restaurant menu photos' },
      { href: '/commercial-photography', label: 'Commercial photography' },
    ] as const
    const html = await render(createElement(NavMenu, { label: 'Use Cases', links }))
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/<ul[^>]*hidden/)
    expect(html).toContain('href="/ai-restaurant-menu"')
    expect(html).toContain('href="/commercial-photography"')
  })
})
