import { describe, expect, it } from 'vitest'

import { posterContentSchema } from '@/core/poster'

import { foldsOf, foldStats } from './block-folds'

const content = posterContentSchema.parse({
  header: { brand: 'SNG', title: '冠军赛', datetime: '' },
  info: { title: '赛事信息' },
  sections: [{ title: '赛事安排', style: 'kv', lines: ['报名：19:00'] }, { title: '', style: 'plain', lines: [] }],
  prizes: { headline: '奖励', rows: [{ rank: '1st', rankEn: '', prize: '威士忌' }] },
  footer: { phones: ['123'], address: '' },
})

describe('the poster editor folds each tab into parts', () => {
  it('splits the header, gives each section its own part and puts the uploads last', () => {
    expect(foldsOf(['header', 'footer'], content, false).map((fold) => fold.key)).toEqual(['masthead', 'title', 'footer'])
    expect(foldsOf(['prizes'], content, true).map((fold) => fold.key)).toEqual(['prizes', 'photos'])
    expect(foldsOf(['sections', 'table'], content, false).map((fold) => fold.key)).toEqual(['info', 'section-0', 'section-1', 'table'])
  })

  it('counts what a part has filled and its lines still to check', () => {
    const [masthead, title] = foldsOf(['header'], content, false)
    expect(foldStats(masthead!, content, ['header.brand', 'header.title'])).toEqual({ filled: 1, total: 5, flagged: 1 })
    expect(foldStats(title!, content, ['header.brand', 'header.title'])).toEqual({ filled: 1, total: 4, flagged: 1 })
    const [, first, second] = foldsOf(['sections'], content, false)
    expect(foldStats(first!, content, ['sections.0.lines.0', 'sections.1.title'])).toEqual({ filled: 2, total: 2, flagged: 1 })
    expect(foldStats(second!, content, [])).toEqual({ filled: 0, total: 2, flagged: 0 })
    expect(foldStats({ key: 'prizes', kind: 'prizes' }, content, ['prizes.rows.0.prize'])).toEqual({ filled: 3, total: 5, flagged: 1 })
    expect(foldStats({ key: 'footer', kind: 'footer' }, content, [])).toEqual({ filled: 1, total: 5, flagged: 0 })
  })
})
