import { describe, expect, it } from 'vitest'

import { holdTitle, usesTitleForShortcut } from './shortcut-title'

// Huawei's ArkWeb UA guide gives this one for the built-in browser on HarmonyOS 6.
const HUAWEI_NEXT =
  'Mozilla/5.0 (Phone; OpenHarmony 6.0; 其他平台 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36  ArkWeb/6.0.0.125 Mobile HuaweiBrowser/5.1.12.303'
const HARMONY_WEBVIEW = 'Mozilla/5.0 (Phone; OpenHarmony 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36  ArkWeb/6.0.0.125 Mobile MicroMessenger/8.0.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const PETALBOT = 'Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)'
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

describe('usesTitleForShortcut', () => {
  it('is true for Huawei Browser only', () => {
    expect(usesTitleForShortcut(HUAWEI_NEXT)).toBe(true)
    for (const ua of [HARMONY_WEBVIEW, ANDROID_CHROME, IOS_SAFARI, PETALBOT, GOOGLEBOT, '']) expect(usesTitleForShortcut(ua)).toBe(false)
  })

  it('never for a crawler that borrows the token', () => {
    expect(usesTitleForShortcut(`${HUAWEI_NEXT} (compatible; Baiduspider/2.0)`)).toBe(false)
  })
})

describe('holdTitle', () => {
  it('sets the brand, restores it after the app changes the title, and stops on cleanup', () => {
    const doc = { title: 'AI改图：换光线换场景换画风，照片主体不变（2026）' }
    let onChange: (() => void) | undefined
    let stopped = false
    const stop = holdTitle(doc, 'Shotviva', (callback) => {
      onChange = callback
      return () => {
        stopped = true
      }
    })
    expect(doc.title).toBe('Shotviva')

    doc.title = '模板 | Shotviva'
    onChange?.()
    expect(doc.title).toBe('Shotviva')

    stop()
    expect(stopped).toBe(true)
  })

  it('does not write when the title is already the brand', () => {
    let writes = 0
    const doc = {
      get title() {
        return 'Shotviva'
      },
      set title(_value: string) {
        writes += 1
      },
    }
    holdTitle(doc, 'Shotviva', () => () => undefined)
    expect(writes).toBe(0)
  })
})
