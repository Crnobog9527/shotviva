import type { SupabaseClient } from '@supabase/supabase-js'
import { createTranslator } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Locale } from '../i18n/locales'
import type { Translate } from '../translate'

const mocks = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))
vi.mock('../logger', () => ({
  logger: {
    error: mocks.error,
    info: mocks.info,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const { notifyTicketReply, renderReplyEmail, ticketLink } = await import('./reply-email')

const TICKET = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const ORIGIN = 'https://shotviva.com'

// core may not import site/, so this mirrors the supportEmail messages of site/messages/*.json.
const en = {
  supportEmail: {
    subject: 'You have a reply from Shotviva support',
    title: 'Your ticket has a new reply',
    body: "We've replied to your support ticket. Open it to read the reply and continue the conversation.",
    button: 'View the reply',
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    footer: "This is an automated email, please don't reply to it. Reply in your ticket on Shotviva instead.",
  },
}
const zh = {
  supportEmail: {
    subject: 'Shotviva 客服回复了你的工单',
    title: '你的工单有新回复',
    body: '我们已经回复了你的工单。点下面的按钮查看回复，也可以在工单里继续沟通。',
    button: '查看回复',
    fallback: '如果按钮点不开，请把下面的链接复制到浏览器打开：',
    footer: '这是系统自动发送的邮件，请勿直接回复。如需继续沟通，请在 Shotviva 的工单里回复。',
  },
}
const messages = { en, zh }
const translate = async (locale: Locale) =>
  createTranslator({
    locale,
    messages: messages[locale],
    namespace: 'supportEmail',
  }) as unknown as Translate

type AuthUser = {
  email?: string
  email_confirmed_at?: string | null
  user_metadata?: Record<string, unknown>
}

function db(user: AuthUser | null, opts: { authError?: boolean; ticketMissing?: boolean } = {}) {
  const maybeSingle = vi.fn(async () => ({
    data: opts.ticketMissing ? null : { user_id: USER },
    error: null,
  }))
  const query = { select: () => query, eq: () => query, maybeSingle }
  const getUserById = vi.fn(async () =>
    opts.authError ? { data: { user: null }, error: new Error('auth down') } : { data: { user }, error: null },
  )
  const client = {
    from: () => query,
    auth: { admin: { getUserById } },
  } as unknown as SupabaseClient
  return { client, getUserById }
}

function deps(client: SupabaseClient, fetchImpl: typeof fetch, key: { apiKey?: string } = { apiKey: 're_test_key' }) {
  return {
    db: client,
    apiKey: key.apiKey,
    from: 'Shotviva <mail@shotviva.com>',
    origin: ORIGIN,
    translate,
    fetch: fetchImpl,
  }
}

const ok = () => vi.fn(async () => new Response('{"id":"x"}', { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>

beforeEach(() => {
  mocks.error.mockClear()
  mocks.info.mockClear()
})

describe('ticketLink', () => {
  it('opens the ticket in the help dialog, in the reader’s language', () => {
    expect(ticketLink(ORIGIN, TICKET, 'en')).toBe(`${ORIGIN}/account?help=${TICKET}`)
    expect(ticketLink(ORIGIN, TICKET, 'zh')).toBe(`${ORIGIN}/zh/account?help=${TICKET}`)
  })
})

describe('renderReplyEmail', () => {
  it('says there is a reply and links to the ticket, in English and Chinese', async () => {
    const link = ticketLink(ORIGIN, TICKET, 'en')
    const email = renderReplyEmail(await translate('en'), link, 'en')
    expect(email.subject).toBe(en.supportEmail.subject)
    expect(email.html).toContain(`href="${link}"`)
    expect(email.html).toContain('lang="en"')
    expect(email.text).toContain(link)

    const zhEmail = renderReplyEmail(await translate('zh'), ticketLink(ORIGIN, TICKET, 'zh'), 'zh')
    expect(zhEmail.subject).toBe(zh.supportEmail.subject)
    expect(zhEmail.html).toContain('lang="zh-Hans"')
    expect(zhEmail.html).toContain(zh.supportEmail.button)
  })
})

describe('notifyTicketReply', () => {
  it('emails the author through Resend with the ticket link only', async () => {
    const { client } = db({
      email: 'buyer@example.com',
      email_confirmed_at: '2026-11-01T00:00:00Z',
      user_metadata: { locale: 'zh' },
    })
    const fetchImpl = ok()
    await expect(notifyTicketReply(deps(client, fetchImpl), TICKET)).resolves.toBe('sent')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers).toMatchObject({ authorization: 'Bearer re_test_key' })
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      from: 'Shotviva <mail@shotviva.com>',
      to: ['buyer@example.com'],
      subject: zh.supportEmail.subject,
    })
    expect(body.html).toContain(`${ORIGIN}/zh/account?help=${TICKET}`)
    expect(mocks.info).toHaveBeenCalledWith('ticket reply email sent', { ticketId: TICKET, emailId: 'x' })
  })

  it('falls back to English when the account has no saved language', async () => {
    const { client } = db({
      email: 'buyer@example.com',
      email_confirmed_at: '2026-11-01T00:00:00Z',
    })
    const fetchImpl = ok()
    await notifyTicketReply(deps(client, fetchImpl), TICKET)
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body))
    expect(body.subject).toBe(en.supportEmail.subject)
  })

  it('skips a phone-only account and an unconfirmed address without calling Resend', async () => {
    for (const user of [{ email: '' }, { email: 'x@example.com', email_confirmed_at: null }]) {
      const { client } = db(user)
      const fetchImpl = ok()
      await expect(notifyTicketReply(deps(client, fetchImpl), TICKET)).resolves.toBe('skipped')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
    expect(mocks.error).not.toHaveBeenCalled()
  })

})

describe('notifyTicketReply when it cannot or must not send', () => {
  it('sends nothing and reads nothing when RESEND_API_KEY is unset', async () => {
    const { client, getUserById } = db({
      email: 'buyer@example.com',
      email_confirmed_at: '2026-11-01T00:00:00Z',
    })
    const fetchImpl = ok()
    await expect(notifyTicketReply(deps(client, fetchImpl, {}), TICKET)).resolves.toBe('skipped')
    expect(getUserById).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('logs and resolves when Resend refuses, times out or the user lookup fails', async () => {
    const user = {
      email: 'buyer@example.com',
      email_confirmed_at: '2026-11-01T00:00:00Z',
    }
    const refused = vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 })) as unknown as typeof fetch
    await expect(notifyTicketReply(deps(db(user).client, refused), TICKET)).resolves.toBe('failed')
    expect(mocks.error).toHaveBeenLastCalledWith('ticket reply email failed', expect.objectContaining({ ticketId: TICKET, status: 403 }))

    const thrown = vi.fn(async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    await expect(notifyTicketReply(deps(db(user).client, thrown), TICKET)).resolves.toBe('failed')

    await expect(notifyTicketReply(deps(db(user, { authError: true }).client, ok()), TICKET)).resolves.toBe('failed')
    expect(mocks.error).toHaveBeenCalledTimes(3)
  })

  it('skips a ticket that no longer exists', async () => {
    const fetchImpl = ok()
    await expect(notifyTicketReply(deps(db(null, { ticketMissing: true }).client, fetchImpl), TICKET)).resolves.toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
