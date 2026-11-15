import { describe, expect, it } from 'vitest'

import { posterFieldsSchema } from '@/core/poster'

import { addPrize, emptyContent, removePrize, insertRow, linesOf, removeRow, setCell, setPrize, setSection, tidyContent } from './content-edit'

const fields = posterFieldsSchema.parse({
  kinds: [{ key: 'rules', name: { en: 'Rules', zh: '规则' }, blocks: ['header', 'table', 'footer'] }],
  tableColumns: ['级别', '基础分'],
})

describe('content edits', () => {
  it('starts with the template table header and no rows', () => {
    expect(emptyContent(fields).table).toEqual({ title: '', titleEn: '', columns: ['级别', '基础分'], rows: [], footnote: '' })
  })

  it('inserts a level row that continues the numbering, and a break row', () => {
    let content = emptyContent(fields)
    content = insertRow(content, -1, 'data')
    content = setCell(content, 0, 0, '5')
    content = insertRow(content, 0, 'break')
    content = insertRow(content, 1, 'data')
    expect(content.table?.rows).toEqual([['5', ''], { break: '' }, ['6', '']])
    expect(removeRow(content, 1).table?.rows).toEqual([['5', ''], ['6', '']])
  })

  it('adds and edits prize rows without touching the others', () => {
    const content = setPrize(addPrize(addPrize(emptyContent(fields))), 1, 'prize', '平板电脑')
    expect(content.prizes?.rows).toEqual([{ rank: '', rankEn: '', prize: '' }, { rank: '', rankEn: '', prize: '平板电脑' }])
  })

  it('keeps blank lines while typing and drops them before saving', () => {
    const content = setSection({ ...emptyContent(fields), sections: [{ title: '规则', style: 'numbered', lines: [] }] }, 0, { lines: linesOf('第一条\n\n') })
    expect(content.sections[0]?.lines).toEqual(['第一条', '', ''])
    expect(tidyContent(content).sections[0]?.lines).toEqual(['第一条'])
  })
})

// A draft saved before the spots were written in (Codex on #678): removing the first featured prize
// keeps the second on its own spot, so its photo stays with it.
describe('removePrize with a display area', () => {
  it('writes the spots in before the row goes', () => {
    const row = (prize: string) => ({ rank: '', rankEn: '', prize })
    const content = { ...emptyContent(fields), prizes: { headline: '', note: '', rows: [row('A'), row('B'), row('C')] } }
    const rows = removePrize(content, 0, 2).prizes?.rows
    expect(rows).toEqual([{ ...row('B'), featured: 2 }, row('C')])
  })
})
