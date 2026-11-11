import { describe, expect, it } from 'vitest'

import { WEEK } from '../analytics/test-samples'
import { AD_SOURCES, ALL_SOURCE_KEYS, hostPattern, SOURCE_TABLE, tagPattern } from './source-table'
import { firstTouchQuery, shapeFirstTouch, shapeVisitors, sourceKey, visitorsBySourceQuery } from './sources'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const PROMOTER = 'sv-5ab21218499743d58270'

// The HogQL patterns are plain regular expressions; walk the table in the classifier's order,
// the way the generated multiIf does, and take the first match.
const re = (literal: string) => new RegExp(literal.slice(1, -1))
const byHost = (host: string) => SOURCE_TABLE.find((def) => def.hosts?.length && re(hostPattern(def)).test(host))?.key ?? null
const byTag = (tag: string) => SOURCE_TABLE.find((def) => def.tags?.length && re(tagPattern(def.tags)).test(tag))?.key ?? null

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
    expect(sourceKey({ promoters: [PROMOTER], creditPromoters: true })).toMatch(new RegExp(`^multiIf\\(\\s+lower\\(extractURLParameter\\(.*'ref'\\)\\) IN \\('${PROMOTER}'\\), 'affiliate'`))
    expect(sourceKey({ promoters: [PROMOTER], creditPromoters: false })).toMatch(/^multiIf\(\s+false, 'affiliate'/)
    expect(sourceKey({ promoters: [], creditPromoters: true })).toMatch(/^multiIf\(\s+false, 'affiliate'/)
  })

  it('never puts anything but a slug into the query', () => {
    expect(sourceKey({ promoters: ["x') OR 1=1 --"], creditPromoters: true })).not.toContain('OR 1=1')
  })

  it('splits paid clicks by network before utm_source and the referrer', () => {
    const expr = sourceKey({ promoters: [], creditPromoters: true })
    for (const id of ['gclid', 'gbraid', 'wbraid']) expect(expr).toMatch(new RegExp(`'${id}'\\).*'ads:google'`))
    expect(expr).toMatch(/'msclkid'\).*'ads:microsoft'/)
    expect(expr).toMatch(/'ttclid'\).*'ads:tiktok'/)
    expect(expr.indexOf("'ads:other'")).toBeLessThan(expr.indexOf("'ai:chatgpt'"))
  })

  it('checks utm_source, then ?ref= values, then the referrer, then falls back', () => {
    const expr = sourceKey({ promoters: [PROMOTER], creditPromoters: true })
    const utm = expr.indexOf('match(lower(coalesce(toString(properties.utm_source)')
    const ref = expr.indexOf('match(if(lower(extractURLParameter')
    const host = expr.indexOf('match(lower(coalesce(toString(properties.$referring_domain)')
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
