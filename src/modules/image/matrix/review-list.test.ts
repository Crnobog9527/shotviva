import { readFileSync } from 'node:fs'

import { NextIntlClientProvider } from 'next-intl'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { BatchPhoto } from '../workspace/photo-batch'
import { cellKey, EMPTY_MATRIX, matrixCells, sharedOptions, type MatrixValues } from './matrix-state'
import { ReviewListView } from './review-list'
import type { MatrixDraft } from './use-matrix-draft'

const messages = JSON.parse(readFileSync('src/site/messages/zh.json', 'utf8')) as Record<string, unknown>

const template = (id: string, resolutions: ('1k' | '2k' | '4k')[]): CatalogueTemplate => ({
  id, name: `模板${id}`, category: 'food', categoryName: '餐饮', categoryOrder: 0, compare: false, description: null, photoInput: 'required',
  imageOptions: { resolutions, aspectRatios: ['1:1'], originalRatio: true }, creditsCost: { '1k': 45, '2k': 90, '4k': 150 }, copyFields: [], toggles: [],
  cover: { type: 'image', before: null, after: `https://assets.example/${id}.webp`, motion: null, poster: null },
})
const photo = (id: string): BatchPhoto => ({ id, url: `blob:${id}`, bytes: 1, ratio: null, upload: { phase: 'done', inputKey: `in/${id}` }, name: `${id}.jpg` })

function render(values: MatrixValues, promo: boolean) {
  const templates = [template('a', ['1k', '2k', '4k']), template('b', ['1k', '2k'])]
  const photos = ['p1', 'p2'].map(photo)
  const draft = {
    promo, balance: { paid: 2400, free: 120 }, values, change: () => {}, caps: { templates: 5, cells: 30 }, chosen: templates,
    photos: { photos }, options: sharedOptions(templates, promo), cells: matrixCells(templates, photos, values, promo),
  } as unknown as MatrixDraft
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'zh', messages } as Parameters<typeof NextIntlClientProvider>[0], createElement(ReviewListView, { draft })))
}

describe('the review list (Owner 2026-11-28)', () => {
  const values = { ...EMPTY_MATRIX, templateIds: ['a', 'b'], notes: { [cellKey('a', 'p2')]: '去掉盘边的葱花' }, removed: [cellKey('b', 'p2')] }

  it('lists each result with its tier and price, its note or the note prompt, and the skipped ones', () => {
    const html = render(values, false)
    for (const text of ['付费积分', '批量只用付费积分', '整批档位', '按模板', '按照片', '全部收起', '全选', '选这组', '选择第 1 张 · 模板a', '选这组：模板a', 'aria-pressed="false"', '模板a', '第 1 张', '去掉盘边的葱花', '补充说明（选填）', '例如：去掉盘边的葱花', '已跳过，不扣积分', '>2K<', '>90<']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('推广积分')
  })

  it('shows an affiliate member both pools and their 1K results', () => {
    const html = render({ ...values, tiers: { [cellKey('b', 'p1')]: '1k' } }, true)
    for (const text of ['企业付费积分', '推广积分', '>1K<', '>推广<', '>45<']) expect(html).toContain(text)
  })
})
