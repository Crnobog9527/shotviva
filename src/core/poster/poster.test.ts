import { describe, expect, it } from 'vitest'

import { partStrings, partText, posterContentSchema, posterFieldsSchema, pagesReady, splitPoster, unverifiedPaths, type TableRow } from '.'

// Fictional content shaped like a weekly tournament set: 10 prizes, 5 rule sections and a
// 26-level table with three break rows.
const levels: TableRow[] = Array.from({ length: 26 }, (_, i) => [String(i + 1), String((i + 1) * 100), String((i + 1) * 200), String((i + 1) * 200)])
const rows: TableRow[] = [...levels.slice(0, 5), { break: '休息　用餐40分钟' }, ...levels.slice(5, 9), { break: '休息10分钟' },
  ...levels.slice(9, 12), { break: '休息10分钟/截止报名' }, ...levels.slice(12)]

const raw = {
  header: { brand: '星海智力运动', cup: '星海杯', city: '中国·云川', title: '周6大师赛', datetimeLabel: '开赛时间', datetime: '14:00' },
  prizes: { headline: '奖励前10名', note: '满员追加奖励', rows: Array.from({ length: 10 }, (_, i) => ({ rank: `第${i + 1}名`, rankEn: '', prize: `奖品${i + 1}（256G）` })) },
  sections: ['赛事安排', '报名说明', '赛事福利', '比赛玩法规则', '特别备注'].map((title) => ({
    title, style: 'numbered', lines: Array.from({ length: 5 }, (_, i) => `${title}第${i + 1}条：按时签到并完成实名登记。`),
  })),
  table: { title: '级别结构', columns: ['级别', '半基础分', '基础分', '预置分'], rows, footnote: '*根据实际情况增加级别' },
  footer: { phones: ['188 0000 1234', '188 0000 5678'], phonesLabel: '赛事热线', addressLabel: '赛事地址', address: '云川市滨江区星海大厦5楼' },
}

const fields = posterFieldsSchema.parse({
  kinds: [
    { key: 'prizes', name: { en: 'Prize poster', zh: '奖品海报' }, blocks: ['header', 'prizes', 'footer'], capacity: { prizeRows: 12 } },
    { key: 'rules', name: { en: 'Rules poster', zh: '规则海报' }, blocks: ['header', 'sections', 'table', 'footer'], capacity: { chars: 700, tableRows: 24 } },
  ],
})

describe('poster content', () => {
  it('cleans each value, keeps full-width spaces and fills absent blocks', () => {
    const content = posterContentSchema.parse({ header: { title: '  周6​大师赛\t ' }, table: { columns: ['a', 'b'], rows: [{ break: '休息　用餐' }] } })
    expect(content.header.title).toBe('周6 大师赛')
    expect(content.table?.rows[0]).toEqual({ break: '休息　用餐' })
    expect(content.prizes).toBeNull()
    expect(content.footer.phones).toEqual([])
  })

  it('refuses a row with the wrong number of cells and a set over the character limit', () => {
    expect(posterContentSchema.safeParse({ table: { columns: ['a', 'b'], rows: [['1']] } }).success).toBe(false)
    const long = { sections: Array.from({ length: 8 }, () => ({ title: 't', lines: Array.from({ length: 10 }, () => 'x'.repeat(120)) })) }
    expect(posterContentSchema.safeParse(long).success).toBe(false)
  })
})

describe('splitPoster: always one page per kind (Owner 2026-11-14)', () => {
  // The Owner's sample fits: 10 prizes on page 1; on page 2 the sections and the 23-row table.
  const roomy = posterFieldsSchema.parse({ kinds: fields.kinds.map((kind) => ({ ...kind, capacity: { prizeRows: 12, chars: 1200, tableRows: 30 } })) })

  it('makes page 1 and page 2, never a third, with every block on its own page', () => {
    const parts = splitPoster(posterContentSchema.parse(raw), roomy)
    expect(parts.map((p) => `${p.kind} ${p.page}/${p.pages}`)).toEqual(['prizes 1/2', 'rules 2/2'])
    expect(parts[0]?.prizes?.rows).toHaveLength(10)
    expect(parts[1]).toMatchObject({ table: { continued: false } })
    expect(parts[1]?.sections).toHaveLength(5)
    expect(parts[1]?.table?.rows).toHaveLength(29)
    expect(pagesReady(parts)).toBe(true)
  })

  it('marks a page over its capacity instead of adding a page', () => {
    const parts = splitPoster(posterContentSchema.parse(raw), fields)
    expect(parts).toHaveLength(2)
    expect(parts[1]?.over).toEqual(['tableRows'])
    const tight = posterFieldsSchema.parse({ ...fields, kinds: [{ ...fields.kinds[0], capacity: { prizeRows: 5 } }, fields.kinds[1]] })
    expect(splitPoster(posterContentSchema.parse(raw), tight)[0]?.over).toEqual(['prizeRows'])
    expect(pagesReady(parts)).toBe(false)
  })

  it('keeps an empty page in the set, marked, so the editor asks for it', () => {
    const parts = splitPoster(posterContentSchema.parse({ ...raw, prizes: null }), roomy)
    expect(parts.map((part) => part.empty ?? false)).toEqual([true, false])
    expect(pagesReady(parts)).toBe(false)
  })
})

describe('partText', () => {
  it('lists one poster in reading order, every row on its own line', () => {
    const [prizes, rules] = splitPoster(posterContentSchema.parse(raw), fields)
    const text = partText(posterContentSchema.parse(raw), prizes!)
    expect(text).toContain('Title: 周6大师赛')
    expect(text).toContain('Row 10: 第10名 | 奖品10（256G）')
    expect(text).toContain('赛事热线: 188 0000 1234   188 0000 5678')
    expect(text).not.toContain('[Table]')
    expect(partText(posterContentSchema.parse(raw), rules!)).toContain('(page 2 of 2)')
  })

  it('writes break rows as full-width rows', () => {
    const parts = splitPoster(posterContentSchema.parse(raw), fields)
    expect(partText(posterContentSchema.parse(raw), parts[1]!)).toContain('Full-width row: 休息　用餐40分钟')
  })
})

describe('the digit check', () => {
  it('spells out every run of five or more digits once, after the poster text, on the page that has them', () => {
    const content = posterContentSchema.parse({ ...raw, sections: [{ title: '报名说明', style: 'kv', lines: ['第3级别　3000赛事分获取50000cc', '第9级别　5000赛事分获取120000cc', '再次获取50000cc'] }] })
    const wide = posterFieldsSchema.parse({ ...fields, kinds: fields.kinds.map((kind) => ({ ...kind, capacity: {} })) })
    const [prizes, rules] = splitPoster(content, wide)
    const text = partText(content, rules!)
    expect(text).toMatch(/\[Digit check: not poster text, never draw this block\]\n50000 has 5 digits: 5-0-0-0-0\n120000 has 6 digits: 1-2-0-0-0-0/)
    expect(text.indexOf('[Digit check')).toBeGreaterThan(text.indexOf('[Footer]'))
    expect(text.match(/50000 has/g)).toHaveLength(1)
    // Phone numbers are written in groups of four, so a page with only those gets no check.
    expect(partText(content, prizes!)).not.toContain('Digit check')
  })
})

describe('the sections column heading', () => {
  it('goes on the poster that carries the sections only, and is checked there', () => {
    const content = posterContentSchema.parse({ ...raw, info: { title: '赛事信息', titleEn: 'INFORMATION' } })
    const wide = posterFieldsSchema.parse({ ...fields, kinds: fields.kinds.map((kind) => ({ ...kind, capacity: {} })) })
    const [prizes, rules] = splitPoster(content, wide)
    expect(partText(content, prizes!)).not.toContain('INFORMATION')
    expect(partText(content, rules!)).toContain('Heading over the sections: 赛事信息 / INFORMATION')
    expect(partStrings(content, rules!).map((item) => item.path)).toEqual(expect.arrayContaining(['info.title', 'info.titleEn']))
    expect(partStrings(content, prizes!).some((item) => item.path.startsWith('info'))).toBe(false)
  })

  it('defaults to blank, so an old saved set still parses', () => {
    expect(posterContentSchema.parse({}).info).toEqual({ title: '', titleEn: '' })
  })
})

describe('unverifiedPaths', () => {
  it('passes reflowed or full-width text and flags a changed character', () => {
    const source = '冠军 奖品1（２５６Ｇ）\n赛事地址：云川市滨江区\n星海大厦5楼'
    const content = { prizes: { rows: [{ rank: '冠军', prize: '奖品1(256G)' }, { rank: '亚军', prize: '奖品2' }] }, footer: { address: '云川市滨江区星海大厦5楼' } }
    expect(unverifiedPaths(content, source)).toEqual(['prizes.rows.1.rank', 'prizes.rows.1.prize'])
  })
})
