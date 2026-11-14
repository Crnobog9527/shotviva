import { describe, expect, it } from 'vitest'

import { WEEK } from '../analytics/test-samples'
import { AD_SOURCES, ALL_SOURCE_KEYS, hostPattern, SOURCE_TABLE, tagPattern } from './source-table'
import { firstTouchQuery, shapeFirstTouch, shapeVisitors, sourceColumns, sourceKey, visitorsBySourceQuery } from './sources'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const PROMOTER = 'sv-5ab21218499743d58270'

// The HogQL patterns are plain regular expressions; walk the table in the classifier's order,
// the way the generated multiIf does, and take the first match.
const re = (literal: string) => new RegExp(literal.slice(1, -1))
const byHost = (host: string) => SOURCE_TABLE.find((def) => def.hosts?.length && re(hostPattern(def)).test(host))?.key ?? null
const byTag = (tag: string) => SOURCE_TABLE.find((def) => def.tags?.length && re(tagPattern(def.tags, def.bare)).test(tag))?.key ?? null

describe('referrer host → source', () => {
  it.each([
    ['www.google.com', 'search:google'],
    ['google.co.jp', 'search:google'],
    ['accounts.google.com', null],
    ['gemini.google.com', 'ai:gemini'],
    ['bing.com', 'search:bing'],
    ['cn.bing.com', 'search:bing'],
    ['edgeservices.bing.com', 'ai:copilot'],
    ['copilot.microsoft.com', 'ai:copilot'],
    ['www.baidu.com', 'search:baidu'],
    ['duckduckgo.com', 'search:duckduckgo'],
    ['search.yahoo.com', 'search:yahoo'],
    ['yandex.ru', 'search:yandex'],
    ['search.naver.com', 'search:naver'],
    ['www.sogou.com', 'search:sogou'],
    ['www.ecosia.org', 'search:other'],
    ['chatgpt.com', 'ai:chatgpt'],
    ['www.perplexity.ai', 'ai:perplexity'],
    ['claude.ai', 'ai:claude'],
    ['chat.deepseek.com', 'ai:deepseek'],
    ['kimi.moonshot.cn', 'ai:kimi'],
    ['www.doubao.com', 'ai:doubao'],
    ['grok.com', 'ai:grok'],
    ['poe.com', 'ai:other'],
    ['x.com', 'social:x'],
    ['t.co', 'social:x'],
    ['old.reddit.com', 'social:reddit'],
    ['m.youtube.com', 'social:youtube'],
    ['xhslink.com', 'social:xiaohongshu'],
    ['l.facebook.com', 'social:facebook'],
    ['weixin110.qq.com', 'social:wechat'],
    ['www.producthunt.com', 'social:producthunt'],
    ['news.ycombinator.com', 'social:other'],
    ['m.bing.com', 'search:bing'],
    ['m.search.naver.com', 'search:naver'],
    ['m.sm.cn', 'search:other'],
    ['r.search.yahoo.com', 'search:yahoo'],
    ['yahoo.co.jp', 'search:yahoo'],
    ['www.yahoo.co.jp', 'search:yahoo'],
    ['www.threads.com', 'social:other'],
    ['x.ai', 'ai:grok'],
    ['meta.ai', 'ai:other'],
    ['notreddit.com', null],
    ['vercel.com', null],
  ])('%s → %s', (host, key) => {
    expect(byHost(host)).toBe(key)
  })
})

describe('utm_source / ?ref= value → source (whole word, optional domain ending)', () => {
  it.each([
    ['chatgpt.com', 'ai:chatgpt'],
    ['chatgpt', 'ai:chatgpt'],
    ['perplexity', 'ai:perplexity'],
    ['google', 'search:google'],
    ['x', 'social:x'],
    ['x.com', 'social:x'],
    ['producthunt', 'social:producthunt'],
    ['xhs', 'social:xiaohongshu'],
    ['x.ai', 'ai:grok'],
    ['meta', 'ai:other'],
    ['meta.ai', 'ai:other'],
    ['twitter.com', 'social:x'],
    ['xavier', null],
    ['fbnewsletter', null],
    ['igloo', null],
    ['claudette', null],
  ])('%s → %s', (tag, key) => {
    expect(byTag(tag)).toBe(key)
  })
})

describe('the table', () => {
  it('has unique keys, and every group ends with its 其他… entry', () => {
    expect(new Set(ALL_SOURCE_KEYS).size).toBe(ALL_SOURCE_KEYS.length)
    for (const group of ['search', 'ai', 'social']) {
      expect(SOURCE_TABLE.filter((d) => d.group === group).at(-1)?.key).toBe(`${group}:other`)
    }
    expect(AD_SOURCES.at(-1)?.key).toBe('ads:other')
  })
})

describe('promoter links and paid clicks', () => {
  it('credits a real promoter slug to 推广员 for visitors only', () => {
    expect(sourceColumns([PROMOTER])).toContain(`IN ('${PROMOTER}') AS src_promoter`)
    expect(sourceKey({ creditPromoters: true })).toMatch(/^multiIf\(\s+src_promoter, 'affiliate'/)
    expect(sourceKey({ creditPromoters: false })).toMatch(/^multiIf\(\s+false, 'affiliate'/)
    expect(sourceColumns([])).toContain('false AS src_promoter')
  })

  it('never puts anything but a slug into the query', () => {
    expect(sourceColumns(["x') OR 1=1 --"])).not.toContain('OR 1=1')
  })

  it('lists the promoter slugs once per query, so the query stays small with many promoters', () => {
    const slugs = Array.from({ length: 1000 }, (_, i) => `sv-${String(i).padStart(20, '0')}`)
    const visitors = visitorsBySourceQuery(WEEK, [ADMIN], slugs).query
    const firstTouch = firstTouchQuery(WEEK, [USER], slugs).query
    expect(visitors.split(slugs[0]!).length - 1).toBe(1)
    expect(firstTouch.split(slugs[0]!).length - 1).toBe(1)
    // ~27 KB of slugs plus the classifier, far under PostHog's query size limit.
    expect(visitors.length).toBeLessThan(80_000)
    expect(firstTouch.length).toBeLessThan(80_000)
  })

  it('splits paid clicks by network before utm_source and the referrer', () => {
    const expr = sourceKey({ creditPromoters: true })
    for (const id of ['gclid', 'gbraid', 'wbraid']) expect(expr).toMatch(new RegExp(`'${id}'\\).*'ads:google'`))
    expect(expr).toMatch(/'msclkid'\).*'ads:microsoft'/)
    expect(expr).toMatch(/'ttclid'\).*'ads:tiktok'/)
    expect(expr.indexOf("'ads:other'")).toBeLessThan(expr.indexOf("'ai:chatgpt'"))
  })

  it('checks utm_source, then ?ref= values, then the referrer, then falls back', () => {
    const expr = sourceKey({ creditPromoters: true })
    const utm = expr.indexOf('match(src_utm,')
    const ref = expr.indexOf("match(if(src_promoter, '', src_ref),")
    const host = expr.indexOf('match(src_domain,')
    expect(utm).toBeGreaterThan(0)
    expect(utm).toBeLessThan(ref)
    expect(ref).toBeLessThan(host)
    expect(expr).toMatch(/accounts\[\.\]google\[\.\]com\|appleid\[\.\]apple\[\.\]com\|checkout\[\.\]stripe\[\.\]com.*'direct'/)
    expect(expr).not.toContain('$initial')
  })
})

describe('source queries', () => {
  it('counts visitors per source by their first page view, without admins or automation', () => {
    const { query } = visitorsBySourceQuery(WEEK, [ADMIN], [PROMOTER])
    expect(query).toContain('argMin(multiIf(')
    expect(query).toContain('GROUP BY source')
    expect(query).toContain(`person_id NOT IN (SELECT person_id FROM events WHERE distinct_id IN ('${ADMIN}')`)
    expect(query).toContain('NOT ((match(')
  })

  it('looks up first touches for the given users only, 90 days back, never as 推广员', () => {
    const { query } = firstTouchQuery(WEEK, [USER], [PROMOTER])
    expect(query).toContain(`distinct_id IN ('${USER}')`)
    expect(query).toContain("toDateTime('2026-08-02T16:00:00.000Z')")
    expect(query).toMatch(/argMinIf\(multiIf\(\s+false, 'affiliate'/)
    expect(query).toContain('LIMIT 10000')
  })
})

describe('shaping', () => {
  it('fills every known source and folds unknown labels into 其他网站', () => {
    const visitors = shapeVisitors([{ source: 'search:google', visitors: 3 }, { source: 'search:gone', visitors: 1 }, { source: 'other', visitors: 1 }])
    expect(visitors['search:google']).toBe(3)
    expect(visitors['search:baidu']).toBe(0)
    expect(visitors.other).toBe(2)
  })

  it('leaves out people with no public page view', () => {
    expect(shapeFirstTouch([{ user_id: USER, source: 'ai:chatgpt' }, { user_id: ADMIN, source: '' }])).toEqual({ [USER]: 'ai:chatgpt' })
  })
})
