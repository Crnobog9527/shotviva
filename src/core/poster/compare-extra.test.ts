import { describe, expect, it } from 'vitest'

import { compareReading, partStrings, posterContentSchema, posterFieldsSchema, splitPoster, type TableRow } from '.'
import sample from './fixtures/xinglan-sample.json'

// The Owner's fictional 星澜 sample (fake brand and phone numbers), and readings shaped like the
// poster_check reader's (one line per row, cells separated by spaces), including the failures seen
// on the test site on 2026-11-14: an invented header row, a table row drawn twice, a made-up row.
const content = posterContentSchema.parse(sample)
const name = { en: 'x', zh: 'x' }
const fields = posterFieldsSchema.parse({ kinds: [
  { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'] },
  { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'] },
] })
const [prizePage, infoPage] = splitPoster(content, fields)

const header = ['星澜智力竞技', 'XINGLAN MIND SPORTS', '星澜杯', 'XINGLAN CUP', '中国·云川', '周6大师赛', 'SATURDAY MASTERS', '开赛时间：14:00']
const footer = ['赛事热线：188 0000 1234   188 0000 5678', '赛事地址：云川市滨江区星澜大厦5楼星澜智力竞技中心', '客服微信']
const prizeLines = [...header, '奖励前10名', '满员追加奖励', ...content.prizes!.rows.map((row) => `${row.rank} ${row.rankEn} | ${row.prize}`), ...footer]
const rowLine = (row: TableRow) => (Array.isArray(row) ? row.join(' ') : row.break)
const infoLines = [
  ...header, '赛事信息 / INFORMATION', '级别结构 STRUCTURE',
  ...content.sections.flatMap((section) => [section.title, ...section.lines.map((line, i) => (section.style === 'numbered' ? `${i + 1}. ${line}` : line))]),
  content.table!.columns.join(' '), ...content.table!.rows.map(rowLine), content.table!.footnote, ...footer,
]

describe('compareReading on the full sample', () => {
  it('passes clean readings of both pages: colons, list numbers and a label after the numbers are layout', () => {
    expect(compareReading(partStrings(content, prizePage!), prizeLines)).toEqual([])
    expect(compareReading(partStrings(content, infoPage!), infoLines)).toEqual([])
  })

  it('passes lines the poster wrapped, read as two (test site, 2026-11-14)', () => {
    const wrapped = infoLines.flatMap((line) => (line === '参赛规则：截止报名前每位运动员最多可重新参赛3次' ? ['参赛规则：截止报名前每位运动员最多可重新', '参赛3次']
      : line.startsWith('2. 生日当天') ? ['2. 生日当天凭有效证件可享半价参赛一次，', '不与其他优惠叠加']
        : line.startsWith('2. 预置分') ? ['2. 预置分级别开始后，基础分位运动员需额外', '投入一个基础分作为全场预置分'] : [line]))
    expect(wrapped.length).toBe(infoLines.length + 3)
    expect(compareReading(partStrings(content, infoPage!), wrapped)).toEqual([])
  })

  it('reports a header row the model invented', () => {
    const lines = [...prizeLines.slice(0, 10), '排名 RANK 奖励', ...prizeLines.slice(10)]
    expect(compareReading(partStrings(content, prizePage!), lines)).toEqual([{ path: 'extra.10', expected: '', seen: '排名 RANK 奖励', kind: 'extra' }])
  })

  it('reports a table row drawn twice', () => {
    const at = infoLines.indexOf('18 6000 12000 12000')
    const lines = [...infoLines.slice(0, at + 1), '18 6000 12000 12000', ...infoLines.slice(at + 1)]
    expect(compareReading(partStrings(content, infoPage!), lines)).toEqual([
      { path: 'table.rows.20.repeated', expected: '18 6000 12000 12000', seen: '18 6000 12000 12000', kind: 'repeated' },
    ])
  })

  it('reports a made-up table row, and a wrong row once (as changed, not again as extra)', () => {
    const at = infoLines.indexOf('14 2500 5000 5000')
    const madeUp = [...infoLines.slice(0, at + 1), '14 3000 6000 6000', ...infoLines.slice(at + 1)]
    expect(compareReading(partStrings(content, infoPage!), madeUp)).toEqual([{ path: `extra.${at + 1}`, expected: '', seen: '14 3000 6000 6000', kind: 'extra' }])
    const wrong = infoLines.map((line) => (line === '17 5000 10000 10000' ? '17 5000 8000 8000' : line))
    expect(compareReading(partStrings(content, infoPage!), wrong)).toEqual([{ path: 'table.rows.19', expected: '17 5000 10000 10000', seen: '17 5000 8000 8000' }])
  })
})
