import { describe, expect, it } from 'vitest'

import { PROVIDER_SETTING_REASONS } from '@/core/providers/setting-error'

import { connectionText, PROVIDERS_COPY } from './copy'

describe('provider admin copy', () => {
  it('has words for every refusal reason', () => {
    for (const reason of PROVIDER_SETTING_REASONS) expect(PROVIDERS_COPY.errors[reason]).toBeTruthy()
  })

  it('describes connection results by status only', () => {
    expect(connectionText({ ok: true, status: 200 })).toBe('连接成功（HTTP 200）')
    expect(connectionText({ ok: false, failure: 'unauthorized', status: 401 })).toContain('鉴权失败')
    expect(connectionText({ ok: false, failure: 'network' })).toBe('连不上这个地址')
  })

  it('never offers a blank estimate for Ark, which cannot be saved blank', () => {
    expect(PROVIDERS_COPY.form.imageCostsHint('ark_images')).not.toContain('留空使用')
    expect(PROVIDERS_COPY.form.imageCostsHint('ark_images')).toContain('不能留空')
    expect(PROVIDERS_COPY.form.imageCostsHint('openrouter_images')).toContain('留空使用可核算的目录估价')
  })
})
