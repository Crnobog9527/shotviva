import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { IDLE } from '@/core/auth/flows/form-state'
import { LoginForm, SignupForm } from '@/core/auth/ui'
import { loadMessages } from '@/site/i18n/messages'

// T63: the 手机号 / 邮箱 tabs exist only where the page passes the phone actions (the Chinese
// pages); the English pages render exactly the email + Google form they had.
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement, locale: 'en' | 'zh') {
  return renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, element))
}

const action = async () => IDLE
const phone = { send: action, verify: action }
const common = { action, google: { action, mainlandNote: false }, resendAction: action, next: '/zh/generate', sender: 'Shotviva <mail@shotviva.com>' }

describe('phone sign-in tab', () => {
  it('the Chinese log-in page opens on 手机号: +86 field, unticked consent box, 获取验证码', async () => {
    const html = await render(createElement(LoginForm, { ...common, notice: null, phone }), 'zh')
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/aria-selected="true"[^>]*>手机号</)
    expect(html).toContain('+86')
    expect(html).toContain('type="tel"')
    expect(html).toMatch(/type="checkbox" name="consent"(?![^>]*checked)/)
    expect(html).toContain('获取验证码')
    // The email form is still there, behind its tab.
    expect(html).toContain('type="email"')
  })

  it('opens on 邮箱 when the notice is about the email flow', async () => {
    const html = await render(createElement(LoginForm, { ...common, notice: 'link_expired', phone }), 'zh')
    expect(html).toMatch(/aria-selected="true"[^>]*>邮箱</)
  })

  it('the Chinese sign-up page has the tabs too', async () => {
    const html = await render(createElement(SignupForm, { ...common, giftCredits: 100, phone }), 'zh')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('获取验证码')
  })

  it('the English pages show no phone entry at all', async () => {
    for (const element of [createElement(LoginForm, { ...common, notice: null }), createElement(SignupForm, { ...common, giftCredits: 100 })]) {
      const html = await render(element, 'en')
      expect(html).not.toContain('role="tablist"')
      expect(html).not.toContain('type="tel"')
      expect(html).not.toMatch(/\+86|Mobile number/)
    }
  })
})
