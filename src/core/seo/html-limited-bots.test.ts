import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/html-bots'
import { describe, expect, it } from 'vitest'

import { HTML_LIMITED_BOTS } from './html-limited-bots'

// Next compiles the configured pattern from its source with the `i` flag (server/lib/
// streaming-metadata.js) and puts the same source into Vercel's cache-bypass route, so the
// source is what has to stay pinned.
const limited = (ua: string) => new RegExp(HTML_LIMITED_BOTS.source, 'i').test(ua)

const UA = {
  chrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  bingbot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/142.0.0.0 Safari/537.36',
  bingPreview: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) BingPreview/1.0b',
  lighthouse:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
  googlebot:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  inspectionTool:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)',
  yandex: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  baidu: 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
  duckduckbot: 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
  applebot:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  twitter: 'Twitterbot/1.0',
  linkedin: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  discord: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  whatsapp: 'WhatsApp/2.23.20.0',
} as const

describe('htmlLimitedBots (next.config.ts)', () => {
  it('is the pattern next.config.ts passes to Next', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(config).toMatch(/^\s*htmlLimitedBots: HTML_LIMITED_BOTS,$/m)
  })

  it('pins the exact list', () => {
    expect(HTML_LIMITED_BOTS.source).toBe(
      'facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|vkShare|quora link preview|redditbot|tumblr|bitlybot|ia_archiver',
    )
  })

  it.each(['bingbot', 'bingPreview', 'lighthouse', 'googlebot', 'inspectionTool', 'yandex', 'baidu', 'duckduckbot', 'applebot', 'chrome'] as const)(
    '%s gets the cached page',
    (name) => {
      expect(limited(UA[name])).toBe(false)
    },
  )

  it.each(['facebook', 'twitter', 'linkedin', 'slack', 'discord', 'whatsapp'] as const)(
    '%s keeps blocking metadata',
    (name) => {
      expect(limited(UA[name])).toBe(true)
    },
  )

  // Narrowing only: every name kept is one Next's default already sends past the cache, so the
  // setting never sends a new user agent to an uncached render.
  it('only keeps names from the default list', () => {
    const defaults = HTML_LIMITED_BOT_UA_RE.source.split('|')
    for (const name of HTML_LIMITED_BOTS.source.split('|')) expect(defaults).toContain(name)
  })

  it('the default list still covers the crawlers this setting takes off it', () => {
    // If a Next upgrade drops them from the default, this setting may no longer be needed.
    for (const name of ['bingbot', 'lighthouse', 'inspectionTool'] as const) expect(HTML_LIMITED_BOT_UA_RE.test(UA[name])).toBe(true)
  })
})
