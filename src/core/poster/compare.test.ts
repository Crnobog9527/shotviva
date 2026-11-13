import { describe, expect, it } from 'vitest'

import { compareReading, partStrings, posterContentSchema, posterFieldsSchema, splitPoster } from '.'

const content = posterContentSchema.parse({
  header: { title: '周6大师赛', datetime: '14:00' },
  prizes: { rows: [{ rank: '冠军', prize: '平板电脑（256G）' }, { rank: '亚军', prize: '智能手表' }] },
  table: { columns: ['级别', '基础分'], rows: [['1', '100']] },
  footer: { phones: ['188 0000 1234'] },
})
const fields = posterFieldsSchema.parse({
  kinds: [
    { key: 'prizes', name: { en: 'P', zh: '奖品' }, blocks: ['header', 'prizes', 'footer'] },
    { key: 'rules', name: { en: 'R', zh: '规则' }, blocks: ['header', 'table', 'footer'] },
  ],
})

describe('partStrings', () => {
  it('lists only what this poster shows: header, footer and its own blocks', () => {
    const [prizes] = splitPoster(content, fields)
    const texts = partStrings(content, prizes!).map((s) => s.text)
    expect(texts).toEqual(['周6大师赛', '14:00', '冠军', '平板电脑（256G）', '亚军', '智能手表', '188 0000 1234'])
  })
})

describe('compareReading', () => {
  const [prizes] = splitPoster(content, fields)
  const expected = partStrings(content, prizes!)

  it('passes a reading with other line breaks, spacing and full-width forms', () => {
    const lines = ['周6 大师赛  14:00', '冠军 平板电脑(256G)', '亚军 智能手表', '188 0000 1234']
    expect(compareReading(expected, lines)).toEqual([])
  })

  it('flags a changed character and shows the closest line read', () => {
    const lines = ['周6大师赛 14:00', '冠军 平板电脑（265G）', '亚军 智能手表', '188 0000 1234']
    expect(compareReading(expected, lines)).toEqual([{ path: 'prizes.rows.0.prize', expected: '平板电脑（256G）', seen: '冠军 平板电脑（265G）' }])
  })

  it('reports a missing line with nothing close as not found', () => {
    const diffs = compareReading(expected, ['周6大师赛 14:00', '冠军 平板电脑（256G）', '188 0000 1234'])
    expect(diffs.map((d) => [d.expected, d.seen])).toEqual([['亚军', ''], ['智能手表', '']])
  })
})
