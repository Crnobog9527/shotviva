import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { posterStrings } from './content'
import sample from './fixtures/xinglan-sample.json'
import { parsePosterNotice } from './parse-notice'

const paste = fs.readFileSync(path.join(__dirname, 'fixtures/xinglan-paste.txt'), 'utf8')

// The sample poster's 167 strings, as this paste words them: the paste has no English headings
// for the info column and the table, keeps half-width spaces and the comma in 福利 1, and its QR
// line is 「客服微信：见二维码」, whose label is the caption.
function expectedForPaste() {
  const expected = new Map(posterStrings(sample).map((item) => [item.path, item.text]))
  for (const key of ['info.title', 'info.titleEn', 'table.titleEn']) expected.delete(key)
  for (const [key, value] of expected) expected.set(key, value.replace(/　/g, ' '))
  expected.set('sections.2.lines.0', '14:00前报名赠早鸟券2张，14:00后赠1张')
  return expected
}

describe('parsePosterNotice', () => {
  it('sorts the Xinglan notice into every field of the sample poster, verbatim', () => {
    const content = parsePosterNotice(paste)
    expect(content).not.toBeNull()
    const got = new Map(posterStrings(content).map((item) => [item.path, item.text]))
    const expected = expectedForPaste()
    expect(expected.size).toBe(164)
    expect(Object.fromEntries(got)).toEqual(Object.fromEntries(expected))
    expect(content?.sections.map((section) => section.style)).toEqual(['kv', 'kv', 'numbered', 'numbered', 'numbered'])
  })

  it('sorts a shorter notice with no colons after the ranks and the cup and title on one line', () => {
    const notice = ['星海智力运动', '星海杯 周六大师赛', '开赛时间 14:00', '',
      '奖励前5名 满员追加奖励', '冠军 旗舰手机Pro（512G）+平板电脑（256G）', '亚军 旗舰手机Pro（512G）', '季军 旗舰手机（256G）', '第四名 平板电脑（128G）', '第五名 智能手表', '',
      '赛事安排', '参赛条件：2000赛事分', '级别时间：30/20/15Min', '',
      '赛事热线 188 0000 1234  188 0000 5678'].join('\n')
    expect(parsePosterNotice(notice)).toBeNull()
    const content = parsePosterNotice(notice.replace('赛事热线 188 0000 1234  188 0000 5678', '赛事热线：188 0000 1234、188 0000 5678\n赛事地址：云川市滨江区星海大厦5楼'))
    expect(content).toMatchObject({
      header: { brand: '星海智力运动', cup: '星海杯', title: '周六大师赛', datetimeLabel: '开赛时间', datetime: '14:00' },
      prizes: { headline: '奖励前5名', note: '满员追加奖励', rows: expect.arrayContaining([{ rank: '第五名', rankEn: '', prize: '智能手表' }]) },
      sections: [{ title: '赛事安排', style: 'kv', lines: ['参赛条件：2000赛事分', '级别时间：30/20/15Min'] }],
      table: null,
      footer: { phones: ['188 0000 1234', '188 0000 5678'], phonesLabel: '赛事热线', addressLabel: '赛事地址', address: '云川市滨江区星海大厦5楼' },
    })
    expect(content?.prizes?.rows).toHaveLength(5)
  })

  it('leaves a notice written as running prose to the model', () => {
    const prose = '各位牌友注意啦！本周六下午两点星海杯周六大师赛准时开打，冠军拿旗舰手机一台，亚军平板，季军手表。报名费200，现场报名。地址在滨江区星海大厦5楼，有事打188 0000 1234。'
    expect(parsePosterNotice(prose)).toBeNull()
    // Without blank lines between the blocks nothing tells a rule title from a rule.
    expect(parsePosterNotice(paste.replace(/\n\s*\n/g, '\n'))).toBeNull()
  })

  it('never returns a value that is not in the paste', () => {
    for (const cut of [200, 600, 900, 1200]) {
      const content = parsePosterNotice(paste.slice(0, cut))
      if (content) expect(posterStrings(content).every((item) => paste.includes(item.text))).toBe(true)
    }
  })

  it('takes a few milliseconds', () => {
    const start = performance.now()
    for (let i = 0; i < 20; i += 1) parsePosterNotice(paste)
    expect((performance.now() - start) / 20).toBeLessThan(20)
  })
})
