import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { HTML_LIMITED_BOTS } from './html-limited-bots'

const require = createRequire(import.meta.url)
const { HTML_LIMITED_BOT_UA_RE } = require('next/dist/shared/lib/router/utils/html-bots.js') as {
  HTML_LIMITED_BOT_UA_RE: RegExp
}

const LIGHTHOUSE_MOBILE =
  'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse'
const LIGHTHOUSE_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Chrome-Lighthouse'

describe('HTML_LIMITED_BOTS', () => {
  it("is Next's default list without Chrome-Lighthouse", () => {
    expect(HTML_LIMITED_BOT_UA_RE.source).toContain('|Chrome-Lighthouse|')
    expect(HTML_LIMITED_BOTS.source).toBe(HTML_LIMITED_BOT_UA_RE.source.replace('|Chrome-Lighthouse|', '|'))
    expect(HTML_LIMITED_BOTS.flags).toBe(HTML_LIMITED_BOT_UA_RE.flags)
  })

  it('lets Lighthouse and PageSpeed Insights get the prerendered shell', () => {
    expect(HTML_LIMITED_BOTS.test(LIGHTHOUSE_MOBILE)).toBe(false)
    expect(HTML_LIMITED_BOTS.test(LIGHTHOUSE_DESKTOP)).toBe(false)
  })

  it('keeps the link-preview and crawler agents that need metadata in the first head', () => {
    for (const ua of ['Twitterbot/1.0', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'AdsBot-Google', 'WhatsApp/2.23']) {
      expect(HTML_LIMITED_BOTS.test(ua)).toBe(true)
    }
  })
})
