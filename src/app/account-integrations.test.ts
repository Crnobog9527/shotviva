import type { SupabaseClient } from '@supabase/supabase-js'
import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { readLinkStatus, type LinkStatus } from '@/core/partner'
import { IntegrationsPanel } from '@/core/partner/ui'
import messages from '@/site/messages/en.json'

type Row = { linked_at: string | null; revoked_at: string | null } | null

// Just the chain readLinkStatus uses, so each case runs the real "active = linked and not revoked"
// rule. The revoke write itself is covered against a real database in tests/db/partner-link.
function clientWith(row: Row): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
  return { from: () => chain } as unknown as SupabaseClient
}

const disconnect = async () => {}
// Children go in as createElement's third argument (react/no-children-prop), which the provider's
// required-children prop type does not model.
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof messages; timeZone: string }>

function render(graylum: LinkStatus) {
  const panel = createElement(IntegrationsPanel, { graylum, disconnect })
  return renderToStaticMarkup(createElement(Intl, { locale: 'en', messages, timeZone: 'UTC' }, panel))
}

const text = (html: string) => html.replace(/<[^>]+>/g, '')
const badge = (html: string) => html.match(/data-status="([^"]+)"[^>]*>([^<]+)</)?.slice(1)
const status = async (row: Row) => render(await readLinkStatus(clientWith(row), 'user-1'))

const LINKED = '2026-11-01T10:00:00Z'

describe('IntegrationsPanel', () => {
  it('lists Graylum under Integrations with its description', async () => {
    const html = await status(null)
    expect(html).toContain('>Integrations</h2>')
    expect(html).toMatch(/<li><details[^>]*><summary/)
    expect(html).toContain('Graylum')
    expect(html).toContain('Your AI social media coach. Find your angle, create posts, and learn from your numbers, with a clear next step every time. Connect to create images with your Shotviva credits.')
  })

  it('shows Enabled and the disconnect action for an active link', async () => {
    const html = await status({ linked_at: LINKED, revoked_at: null })
    expect(badge(html)).toEqual(['enabled', 'Enabled'])
    expect(text(html)).toContain('Connected since Nov 1, 2026.')
    expect(html).toContain('>Disconnect Graylum</button>')
  })

  it('shows Not enabled and no button when the account never connected', async () => {
    const html = await status(null)
    expect(badge(html)).toEqual(['not-enabled', 'Not enabled'])
    expect(html).toContain('To connect, start from Graylum')
    expect(html).not.toContain('<button')
  })

  it('shows Not enabled for a revoked link', async () => {
    const html = await status({ linked_at: LINKED, revoked_at: '2026-11-02T10:00:00Z' })
    expect(badge(html)).toEqual(['not-enabled', 'Not enabled'])
    expect(html).not.toContain('Disconnect Graylum')
  })

  it('flips to Not enabled once Disconnect has revoked the link and the page re-reads it', async () => {
    const row = { linked_at: LINKED, revoked_at: null as string | null }
    expect(badge(await status(row))).toEqual(['enabled', 'Enabled'])
    row.revoked_at = '2026-11-06T09:00:00Z' // what revokeLink writes
    expect(badge(await status(row))).toEqual(['not-enabled', 'Not enabled'])
  })
})
