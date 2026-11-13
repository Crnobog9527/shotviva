import { describe, expect, it } from 'vitest'

import { partStrings, partText, posterContentSchema, posterFieldsSchema, splitPoster, tablePages, unverifiedPaths, type TableRow } from '.'

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

describe('splitPoster', () => {
  it('fits the prizes on one poster and splits the rules into sections and table pages', () => {
    const parts = splitPoster(posterContentSchema.parse(raw), fields)
    expect(parts.map((p) => `${p.kind} ${p.page}/${p.pages}`)).toEqual(['prizes 1/1', 'rules 1/3', 'rules 2/3', 'rules 3/3'])
    expect(parts[0]?.prizes?.rows).toHaveLength(10)
    expect(parts[1]?.sections).toHaveLength(5)
    expect(parts[2]?.table?.rows.length).toBeLessThanOrEqual(24)
    expect(parts[3]?.table?.continued).toBe(true)
  })

  it('keeps sections and table on one poster when both fit, and makes nothing for empty blocks', () => {
    const small = posterContentSchema.parse({ ...raw, prizes: null, sections: raw.sections.slice(0, 1), table: { ...raw.table, rows: rows.slice(0, 10) } })
    const parts = splitPoster(small, fields)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ kind: 'rules', page: 1, pages: 1, table: { continued: false } })
    expect(parts[0]?.sections).toHaveLength(1)
  })

  it('cuts a long table after a break row in the second half of a page', () => {
    const pages = tablePages(rows, 24)
    expect(pages.map((page) => page.length)).toEqual([15, 14])
    expect(pages[0]?.at(-1)).toEqual({ break: '休息10分钟/截止报名' })
  })

  it('marks a section too long for a whole poster', () => {
    const tight = posterFieldsSchema.parse({ kinds: [{ ...fields.kinds[1], capacity: { chars: 100 } }] })
    const parts = splitPoster(posterContentSchema.parse({ sections: raw.sections.slice(0, 1) }), tight)
    expect(parts[0]?.oversized).toBe(true)
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
    expect(partText(posterContentSchema.parse(raw), rules!)).toContain('(poster 1 of 3)')
  })

  it('writes break rows as full-width rows', () => {
    const parts = splitPoster(posterContentSchema.parse(raw), fields)
    expect(partText(posterContentSchema.parse(raw), parts[2]!)).toContain('Full-width row: 休息　用餐40分钟')
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
