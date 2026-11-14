import { describe, expect, it } from 'vitest'

import { posterFieldsSchema, splitPoster, pagesReady, posterContentSchema } from '@/core/poster'
import sample from '@/core/poster/fixtures/xinglan-sample.json'

import { clearAll, clearPrizes, clearTable, emptyContent, isSampleText, sampleContactsLeft, setFooter, setHeader, setPrize, startContent, tidyContent } from './content-edit'
import { freshDraft, readDraft } from './use-poster-studio'

// The two-page tournament set with the cover poster's text as its sample (fields.poster.sample).
const kinds = [
  { key: 'prizes', name: { en: 'Prize page', zh: '奖品页' }, blocks: ['header', 'prizes', 'footer'], capacity: { prizeRows: 12 } },
  { key: 'rules', name: { en: 'Information page', zh: '信息页' }, blocks: ['header', 'sections', 'table', 'footer'], capacity: { chars: 900, tableRows: 30 } },
]
const withSample = posterFieldsSchema.parse({ kinds, tableColumns: ['级别', '半基础分', '基础分', '预置分'], infoHeading: { title: '赛事信息', titleEn: 'INFORMATION' }, sample })
const bare = posterFieldsSchema.parse({ kinds, tableColumns: ['级别', '半基础分', '基础分', '预置分'] })

describe('starting from the sample', () => {
  it('takes the whole cover text: every block, row and column, both pages ready', () => {
    const content = startContent(withSample)
    expect(content.prizes?.rows).toHaveLength(10)
    expect(content.sections.map((section) => section.title)).toEqual(['赛事安排', '报名说明', '赛事福利', '比赛玩法规则', '特别备注'])
    expect(content.table?.rows).toHaveLength(23)
    expect(content.footer.phones).toEqual(['188 0000 1234', '188 0000 5678'])
    const parts = splitPoster(posterContentSchema.parse(tidyContent(content)), withSample)
    expect(pagesReady(parts)).toBe(true)
  })

  it('copies the sample, so editing never changes the template', () => {
    const content = setHeader(startContent(withSample), 'brand', '金鼎')
    expect(content.header.brand).toBe('金鼎')
    expect(withSample.sample?.header.brand).toBe('星澜智力竞技')
  })

  it('keeps the bare skeleton for a template without a sample', () => {
    expect(startContent(bare)).toEqual(emptyContent(bare))
    expect(freshDraft({ poster: bare }).fromSample).toBe(false)
  })
})

describe('clearing', () => {
  it('drops every word and keeps the shape: rows, sections, columns', () => {
    const cleared = clearAll(startContent(withSample))
    expect(cleared.prizes?.rows).toHaveLength(10)
    expect(cleared.prizes?.rows.every((row) => !row.rank && !row.rankEn && !row.prize)).toBe(true)
    expect(cleared.sections).toHaveLength(5)
    expect(cleared.sections.every((section) => !section.title && section.lines.length === 0)).toBe(true)
    expect(cleared.table?.columns).toEqual(['级别', '半基础分', '基础分', '预置分'])
    expect(cleared.table?.rows).toHaveLength(23)
    expect(cleared.header.brand).toBe('')
    expect(cleared.footer.phones).toEqual([])
  })

  it('saves nothing of a part left blank, so the page asks to be filled', () => {
    const content = clearTable(clearPrizes(startContent(withSample)))
    const tidy = tidyContent(content)
    expect(tidy.prizes?.rows).toEqual([])
    expect(tidy.table?.rows).toEqual([])
    const parts = splitPoster(posterContentSchema.parse(tidy), withSample)
    expect(parts[0]?.empty).toBe(true)
    expect(parts[1]?.empty).toBeUndefined()
  })

  it('keeps a half-filled row', () => {
    const content = setPrize(clearPrizes(startContent(withSample)), 0, 'prize', '奖杯')
    expect(tidyContent(content).prizes?.rows).toEqual([{ rank: '', rankEn: '', prize: '奖杯' }])
  })
})

describe('sample marks', () => {
  it('marks a value only while it is still the sample text', () => {
    const content = startContent(withSample)
    expect(isSampleText(content, withSample.sample, 'header.brand')).toBe(true)
    expect(isSampleText(content, withSample.sample, 'prizes.rows.0.prize')).toBe(true)
    expect(isSampleText(content, withSample.sample, 'table.rows.4.break')).toBe(true)
    expect(isSampleText(content, withSample.sample, 'sections.0.lines')).toBe(true)
    expect(isSampleText(content, withSample.sample, 'footer.phones')).toBe(true)
    const edited = setPrize(content, 0, 'prize', '奖杯')
    expect(isSampleText(edited, withSample.sample, 'prizes.rows.0.prize')).toBe(false)
    expect(isSampleText(clearAll(content), withSample.sample, 'header.brand')).toBe(false)
    expect(isSampleText(content, undefined, 'header.brand')).toBe(false)
  })

  it('reminds while the organiser, a phone or the address is the sample one', () => {
    let content = startContent(withSample)
    expect(sampleContactsLeft(content, withSample.sample)).toBe(true)
    content = setHeader(content, 'brand', '金鼎俱乐部')
    content = setFooter(content, 'address', '岳阳市')
    expect(sampleContactsLeft(content, withSample.sample)).toBe(true)
    content = { ...content, footer: { ...content.footer, phones: ['139 1111 2222'] } }
    expect(sampleContactsLeft(content, withSample.sample)).toBe(false)
    expect(sampleContactsLeft(clearAll(startContent(withSample)), withSample.sample)).toBe(false)
    expect(sampleContactsLeft(content, undefined)).toBe(false)
  })
})

describe('stored drafts', () => {
  it('starts an untouched skeleton draft from the sample', () => {
    const old = JSON.stringify({ step: 'paste', source: '', content: emptyContent(withSample), unverified: [], reviewed: false, sorted: false })
    const draft = readDraft({ poster: withSample }, old)
    expect(draft.fromSample).toBe(true)
    expect(draft.content.prizes?.rows).toHaveLength(10)
  })

  it('keeps a draft the user typed into', () => {
    const typed = setHeader(emptyContent(withSample), 'title', '周4精英赛')
    const draft = readDraft({ poster: withSample }, JSON.stringify({ step: 'edit', content: typed, sorted: false, fromSample: false }))
    expect(draft.content.header.title).toBe('周4精英赛')
    expect(draft.fromSample).toBe(false)
  })
})
