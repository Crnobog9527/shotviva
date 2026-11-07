import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ActionBar, FlowNav, TabBar } from '@/core/app-shell'
import { UnreadDot } from '@/core/support/ui/unread-dot'
import { loadMessages } from '@/site/i18n/messages'

// The bars must not depend on our layered utilities winning over everything else on the page.
// A browser extension or an automation tool that injects its own (unlayered) Tailwind CSS beats
// every rule in our cascade layers, md: ones included. With `fixed bottom-0 … md:sticky
// md:top-0 md:bottom-auto`, its `.fixed` kept the desktop top bar fixed over the page's top and
// the flow pages' action bar fixed over their bottom (Owner, 2026-11-07). So an element never
// carries a bare position/offset class that an md:/lg: class is meant to undo: the phone-only
// placement is written max-md:.

vi.mock('@/core/i18n/navigation', async (original) => ({ ...(await original()), usePathname: () => '/account' }))

// children as createElement's third argument (react/no-children-prop) needs it optional here.
const Bar = ActionBar as FunctionComponent<{ className?: string; children?: ReactNode }>

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement) {
  return renderToStaticMarkup(createElement(Intl, { locale: 'en', messages: await loadMessages('en'), timeZone: 'UTC' }, element))
}

const GROUPS: Record<string, RegExp> = {
  position: /^(static|fixed|absolute|relative|sticky)$/,
  top: /^(top-|inset-y-|inset-(?!x-|y-))/,
  bottom: /^(bottom-|inset-y-|inset-(?!x-|y-))/,
  left: /^(left-|inset-x-|inset-(?!x-|y-))/,
  right: /^(right-|inset-x-|inset-(?!x-|y-))/,
}

// Each class attribute in the markup: a bare class in a group that an md:/lg: class of the same
// group also sets is a problem.
function bareOverrides(html: string): string[] {
  const problems: string[] = []
  for (const [, value] of html.matchAll(/class="([^"]*)"/g)) {
    const tokens = value.split(/\s+/).filter(Boolean)
    for (const [group, pattern] of Object.entries(GROUPS)) {
      const bare = tokens.filter((token) => !token.includes(':') && pattern.test(token))
      const wide = tokens.filter((token) => /^(md|lg|xl):/.test(token) && pattern.test(token.split(':')[1] ?? ''))
      if (bare.length && wide.length) problems.push(`${group}: ${bare.join(' ')} undone by ${wide.join(' ')}`)
    }
  }
  return problems
}

describe('bar placement survives injected unlayered CSS', () => {
  it('the check itself flags the old tab bar and action bar classes', () => {
    expect(bareOverrides('<nav class="bar-material fixed inset-x-0 bottom-0 md:sticky md:top-0 md:bottom-auto"></nav>')).toEqual([
      'position: fixed undone by md:sticky',
      'bottom: bottom-0 undone by md:bottom-auto',
    ])
    expect(bareOverrides('<div class="action-material fixed inset-x-0 bottom-0 md:static md:mt-8"></div>')).toEqual(['position: fixed undone by md:static'])
    expect(bareOverrides('<header class="sticky top-0 md:top-14"></header>')).toEqual(['top: top-0 undone by md:top-14'])
    expect(bareOverrides('<div class="max-md:fixed max-md:bottom-0 md:sticky md:top-0"></div>')).toEqual([])
  })

  it('the tab bar', async () => {
    const html = await render(createElement(TabBar, { items: [{ href: '/account', label: 'Account', icon: 'account' }] }))
    expect(html).toContain('data-tabbar')
    expect(bareOverrides(html)).toEqual([])
  })

  it('the action bar', async () => {
    const html = await render(createElement(Bar, { className: 'md:px-0' }, 'Download'))
    expect(html).toContain('max-md:fixed')
    expect(bareOverrides(html)).toEqual([])
  })

  it('the flow nav, under the tab bar and on its own', async () => {
    for (const underTabBar of [true, false]) {
      const html = await render(createElement(FlowNav, { back: { href: '/photos', label: 'Photos' }, title: 'A photo', underTabBar }))
      expect(bareOverrides(html)).toEqual([])
    }
  })

  it('the unread dot on a tab', async () => {
    expect(bareOverrides(await render(createElement(UnreadDot, { label: 'New reply', tab: true })))).toEqual([])
  })
})
