import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

// The settled states of the workspace and of a photo edit (T6 gap audit C2–C6): the comp's
// words in English, and every new line in Chinese with the same placeholders.
const tag = (chunks: string) => chunks
const ws = createTranslator({ locale: 'en', messages: en, namespace: 'app.workspace' })
const edit = createTranslator({ locale: 'en', messages: en, namespace: 'app.edit' })

describe('settled states (en)', () => {
  it('keeps the workspace done and failed wording (workspace.html)', () => {
    expect(ws('doneState.saved')).toBe('Saved to Photos')
    expect(ws.markup('doneState.line', { tier: 'Standard', px: 1024, count: 2, pool: 'free', mono: tag })).toBe(
      "Standard · 1024 px · 2 credits used. Made with free credits, so it's public with a watermark.",
    )
    expect(ws.markup('doneState.line', { tier: 'Standard', px: 1024, count: 2, pool: 'none', mono: tag })).toBe('Standard · 1024 px · 2 credits used.')
    expect(ws('doneState.caption', { name: 'Pure White' })).toBe('Phone photo → Pure White.')
    expect(ws('failState.titleRefunded')).toBe('Generation failed. Your credits were refunded.')
    expect(ws('failState.kept')).toBe('Your photo and settings are kept. Try again, or change the photo.')
    expect([ws('failState.hud'), ws('failState.changePhoto'), ws('failState.caption')]).toEqual(['Not developed', 'Change photo', 'Nothing was charged.'])
    expect(ws.markup('retryCost', { count: 2, cost: (chunks) => `[${chunks}]` })).toBe('Retry [· 2 credits]')
    expect(ws.markup('retryCost', { count: 1, cost: tag })).toBe('Retry · 1 credit')
  })

  it('keeps the edit developing and failed wording (photo.html)', () => {
    expect(edit('requestSent')).toBe('Request sent')
    expect(edit('developingCaption')).toBe('The edit is developing over the original.')
    expect(edit('failTitleRefunded')).toBe('The edit failed. Your credits were refunded.')
    expect(edit('failKept')).toBe('Your request is kept. Try again, or change what you asked for.')
    expect(edit('metaFailed', { size: 'Post 4:5', tier: 'Standard', refund: 'refunded', count: 2 })).toBe('Just now · Post 4:5 · Standard · 2 credits refunded · edit')
    expect(edit('metaFailed', { size: 'Post 4:5', tier: 'Standard', refund: 'none', count: 2 })).toBe('Just now · Post 4:5 · Standard · nothing charged · edit')
    // Spec #156: about 60 seconds, not the comp's 20–40.
    expect(edit('leave')).toMatch(/about 60 seconds/)
  })

  it('puts the size on Download (photo.html #download)', () => {
    const result = createTranslator({ locale: 'en', messages: en, namespace: 'app.result' })
    expect(result.markup('downloadPx', { px: 2880, cost: tag, mono: tag })).toBe('Download · 2880 px')
  })
})

describe('settled states (zh)', () => {
  it('has every new line, with the same placeholders', () => {
    const z = createTranslator({ locale: 'zh', messages: zh, namespace: 'app' })
    expect(z.markup('workspace.doneState.line', { tier: '标准', px: 1024, count: 2, pool: 'paid', mono: tag })).toBe('标准 · 1024 px · 用了 2 积分。用的是付费积分，所以是私密的，没有水印。')
    expect(z.markup('workspace.retryCost', { count: 2, cost: tag })).toBe('重试 · 2 积分')
    expect(z('edit.metaFailed', { size: '贴文 4:5', tier: '标准', refund: 'refunded', count: 2 })).toBe('刚刚 · 贴文 4:5 · 标准 · 已退回 2 积分 · 修改')
    expect(z.markup('result.downloadPx', { px: 1024, cost: tag, mono: tag })).toBe('下载 · 1024 px')
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(zh.app.workspace.doneState)).toEqual(keys(en.app.workspace.doneState))
    expect(keys(zh.app.workspace.failState)).toEqual(keys(en.app.workspace.failState))
    expect(keys(zh.app.edit)).toEqual(keys(en.app.edit))
  })
})
