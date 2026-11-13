import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AuthorizePlate, type AuthorizeTarget } from '@/core/partner/ui/authorize-form'
import en from '@/site/messages/en.json'

type Messages = typeof en
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: Messages; timeZone: string }>
const render = (element: ReactElement) => renderToStaticMarkup(createElement(Intl, { locale: 'en', messages: en, timeZone: 'UTC' }, element))

// The children render prop goes in as createElement's third argument.
type PlateProps = { target: AuthorizeTarget; label: string; variant: 'primary' | 'ghost'; sent: boolean; onSubmit(): void }
const Plate = AuthorizePlate as unknown as FunctionComponent<PlateProps>

const target = { action: '/en/connect/graylum/authorize', state: 'graylum-state-1', returnTo: null, graylumHome: 'https://graylum.com' }
const plate = (sent: boolean) =>
  render(createElement(Plate, { target, label: 'Allow', variant: 'primary', sent, onSubmit: () => {} }, ((submit: ReactNode) => createElement('main', null, submit)) as never))

describe('AuthorizePlate', () => {
  it('keeps the Allow form in the document after submit, so the browser can finish the POST', () => {
    const html = plate(true)
    // Unmounting the form on submit cancels the navigation ("form is not connected"): no code, no 302.
    expect(html).toContain('action="/en/connect/graylum/authorize"')
    expect(html).toContain('name="state" value="graylum-state-1"')
    expect(html).toContain('id="connect-done"')
    expect(html).toMatch(/<div hidden/)
  })

  it('shows only the form before submit', () => {
    const html = plate(false)
    expect(html).toContain('action="/en/connect/graylum/authorize"')
    expect(html).not.toContain('id="connect-done"')
    expect(html).not.toMatch(/<div hidden/)
  })
})
