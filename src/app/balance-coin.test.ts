import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import messages from '@/site/messages/en.json'

import { BalanceChip } from '@/core/app-shell'

// Gap audit C10: the balance coin is flat safelight with a top highlight, as the comp's
// studio.css .bal .coin, not the old radial gradient.

vi.mock('@/core/billing/paywall/paywall-context', () => ({ usePaywall: () => ({ open() {} }) }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

describe('BalanceChip coin', () => {
  it('is a 20px flat safelight disc with a 1px top highlight and no number', () => {
    const chip = createElement(BalanceChip, { balance: { paid: 30, free: 6 } })
    const html = renderToStaticMarkup(createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' }, chip))
    const coin = html.match(/<span[^>]*data-coin=""[^>]*><\/span>/)?.[0] ?? ''
    expect(coin).toContain('size-5')
    expect(coin).toContain('bg-primary')
    expect(coin).toContain('shadow-[inset_0_1px_0_var(--coin-gloss)]')
    expect(coin).not.toContain('gradient')
    expect(html).toContain('30 + 6 free')
  })
})
