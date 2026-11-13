import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { IDLE } from '@/core/auth/flows/form-state'
import { LoginForm, SignupForm } from '@/core/auth/ui'
import { loadMessages } from '@/site/i18n/messages'

// Mainland China (2026-11-12): the sign-in forms as the server sends them, before React hydrates
// (which can take many seconds there), and the line under the Google button.
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement, locale: 'en' | 'zh') {
  return renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, element))
}

const action = async () => IDLE
const phone = { send: action, verify: action }
const base = { action, resendAction: action, next: '/zh/generate', sender: 'Shotviva <mail@shotviva.com>' }
const login = (mainlandNote: boolean, extra: object = {}) =>
  createElement(LoginForm, { ...base, google: { action, mainlandNote }, notice: null, ...extra })

describe('before hydration', () => {
  it('every submit button is disabled and carries the still-loading label, so a press cannot reload the page', async () => {
    const html = await render(login(true, { phone }), 'zh')
    const buttons = html.match(/<button type="submit" disabled=""[^>]*data-wait=""[^>]*class="au-btn au-primary"/g) ?? []
    expect(buttons).toHaveLength(2) // 获取验证码 and 登录
    expect(html).toContain('<span class="au-wait">页面还在加载…</span>')
  })

  it('posts if it ever submits natively, so no address, number or password lands in the URL', async () => {
    const html = await render(login(false, { phone }), 'zh')
    const own = (html.match(/<form [^>]*>/g) ?? []).filter((tag) => !tag.includes('action='))
    expect(own.length).toBeGreaterThanOrEqual(2)
    for (const tag of own) expect(tag).toContain('method="post"')
  })
})

describe('Google on mainland networks', () => {
  it('says so under the button when the server decides it', async () => {
    expect(await render(login(true), 'en')).toContain('doesn&#x27;t load on networks in mainland China')
    expect(await render(login(false), 'en')).not.toContain('au-gnote')
    const signup = createElement(SignupForm, { ...base, google: { action, mainlandNote: true }, giftCredits: 100, phone })
    expect(await render(signup, 'zh')).toContain('中国大陆网络下，Google 登录通常打不开')
  })

  it('shows on English pages for mainland time zones only (the page is static)', async () => {
    const { inMainlandZone } = await import('./[locale]/(auth)/mainland-zone')
    for (const zone of ['Asia/Shanghai', 'Asia/Urumqi']) expect(inMainlandZone(zone)).toBe(true)
    for (const zone of ['Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'America/New_York', 'UTC']) expect(inMainlandZone(zone)).toBe(false)
  })
})
