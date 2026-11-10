import { describe, expect, it } from 'vitest'

import { AI_CRAWLERS, PRELAUNCH_BLOCKED_CRAWLERS } from '../src/core/seo/crawlers'
import { evaluate, metaRobots, parseArgs, robotsGroups, type Fetched, type Snapshot } from './seo-check-lib'

const NOINDEX = 'noindex, nofollow'
const page = (robots: string, xRobotsTag: string | null): Fetched => ({
  status: 200,
  xRobotsTag,
  body: `<html><head><meta name="robots" content="${robots}"/></head></html>`,
})
const file = (status: number, body = '', xRobotsTag: string | null = null): Fetched => ({ status, xRobotsTag, body })

// What Next renders for robotsRules() closed / open (core/seo/robots.ts).
const closedRobots = ['User-Agent: *', 'Allow: /', '', ...PRELAUNCH_BLOCKED_CRAWLERS.map((b) => `User-Agent: ${b}`), 'Disallow: /', ''].join('\n')
const openRobots = [
  'User-Agent: *',
  'Allow: /',
  'Disallow: /api/',
  'Disallow: /account',
  '',
  'User-Agent: Bytespider',
  'Disallow: /',
  '',
  'Sitemap: https://shotviva.com/sitemap.xml',
].join('\n')

const closed: Snapshot = {
  home: page(NOINDEX, NOINDEX),
  robots: file(200, closedRobots, NOINDEX),
  sitemap: file(404),
  sitemapPages: file(404),
  llms: file(404),
}
const open: Snapshot = {
  home: page('index, follow', null),
  robots: file(200, openRobots),
  sitemap: file(200, '<sitemapindex/>'),
  sitemapPages: file(200, '<urlset/>'),
  llms: file(200, '# Shotviva'),
}

describe('seo:check', () => {
  it('passes a closed site expected closed and an open site expected open', () => {
    expect(evaluate(closed, 'closed')).toEqual([])
    expect(evaluate(open, 'open')).toEqual([])
  })

  it('fails an open site expected closed, naming what is wrong', () => {
    const problems = evaluate(open, 'closed')
    expect(problems).toContain('/ has no X-Robots-Tag: noindex')
    expect(problems).toContain('/ has no robots noindex meta')
    expect(problems).toContain('robots.txt has a Sitemap line')
    expect(problems).toContain('robots.txt does not disallow ClaudeBot')
    expect(problems).toContain('/sitemap.xml answered 200, expected 404')
    expect(problems).toContain('/llms.txt answered 200, expected 404')
  })

  it('fails a closed site expected open', () => {
    const problems = evaluate(closed, 'open')
    expect(problems).toContain('/ still sends X-Robots-Tag: noindex')
    expect(problems).toContain('robots.txt disallows GPTBot')
    expect(problems).toContain('/sitemap-pages.xml answered 404, expected 200')
  })

  it('catches a closed site that blocks Google too, or misses one AI crawler', () => {
    const blocksAll = { ...closed, robots: file(200, 'User-agent: *\nDisallow: /\n', NOINDEX) }
    expect(evaluate(blocksAll, 'closed')).toContain('robots.txt disallows * (Google and Bing must be able to see noindex)')
    const missing = { ...closed, robots: file(200, closedRobots.replace('User-Agent: Bytespider\n', ''), NOINDEX) }
    expect(evaluate(missing, 'closed')).toEqual(['robots.txt does not disallow Bytespider'])
  })

  it('reports an unreachable home page', () => {
    expect(evaluate({ ...closed, home: file(500) }, 'closed')[0]).toBe('/ answered 500, expected 200')
  })

  it('parses robots groups and the robots meta', () => {
    expect(robotsGroups('User-agent: A\nUser-agent: B\nDisallow: /\n\nUser-agent: *\nAllow: /')).toEqual([
      { agents: ['a', 'b'], rules: ['disallow:/'] },
      { agents: ['*'], rules: ['allow:/'] },
    ])
    expect(metaRobots('<meta name="robots" content="noindex, nofollow"/>')).toBe(NOINDEX)
    expect(metaRobots('<p>none</p>')).toBeNull()
  })

  it('takes a URL and --expect=closed|open', () => {
    expect(parseArgs(['https://shotviva.com/x', '--expect=closed'])).toEqual({ origin: 'https://shotviva.com', expectation: 'closed' })
    expect(() => parseArgs(['https://shotviva.com'])).toThrow(/Usage/)
    expect(() => parseArgs(['https://shotviva.com', '--expect=maybe'])).toThrow(/Usage/)
  })
})
