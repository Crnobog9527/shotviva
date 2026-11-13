import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { metadataLocale } from '../auth/session-user'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { logger } from '../logger'
import type { Translate } from '../translate'
import { ticketAuthor } from './admin'
import { HELP_PARAM } from './ui/help-param'

// D13: when the Owner replies to a ticket, the author gets a short email saying so, with a link
// to the ticket on /account. It never carries the reply itself (nor anything else from the
// ticket), only that there is one. Sent with Resend's HTTP API, the provider Supabase Auth
// already sends from for shotviva.com. Best effort: nothing here throws, a failure is logged and
// the reply stands. Called after the reply is saved (the action schedules it with after()).

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export type ReplyEmail = { subject: string; html: string; text: string }

export type ReplyEmailDeps = {
  db: SupabaseClient
  // RESEND_API_KEY; unset → nothing is sent (local, CI, an environment not set up yet).
  apiKey: string | undefined
  // `Shotviva <mail@shotviva.com>`, the sender already verified for the auth emails.
  from: string
  // The site origin the ticket link points at (appOrigin).
  origin: string
  // The supportEmail messages in a locale (getTranslations in the action; createTranslator in tests).
  translate: (locale: Locale) => Promise<Translate>
  fetch?: typeof fetch
}

export type ReplyEmailOutcome = 'sent' | 'skipped' | 'failed'

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function ticketLink(origin: string, ticketId: string, locale: Locale): string {
  return `${origin}${localizePath(`/account?${HELP_PARAM}=${ticketId}`, locale)}`
}

type Lines = { title: string; body: string; button: string; fallback: string; footer: string }

const SANS = 'font-family:Arial,Helvetica,sans-serif;'

// The card (wordmark, title, line, one button, the link spelled out); every value already escaped.
function card(e: Lines, href: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e4e4e0;border-radius:8px;">
<tr>
<td style="padding:32px 32px 0 32px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:30px;color:#0b0a09;"><img src="https://shotviva.com/brand/email/shotviva-wordmark@2x.png" width="105" height="30" alt="Shotviva" style="display:block;width:105px;height:30px;border:0;outline:none;text-decoration:none;"></td>
</tr>
<tr>
<td style="padding:24px 32px 0 32px;${SANS}font-size:22px;line-height:30px;font-weight:bold;color:#171717;">${e.title}</td>
</tr>
<tr>
<td style="padding:12px 32px 0 32px;${SANS}font-size:16px;line-height:24px;color:#3d3d3a;">${e.body}</td>
</tr>
<tr>
<td style="padding:24px 32px 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#171717" style="background-color:#171717;border-radius:6px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;${SANS}font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${e.button}</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:24px 32px 0 32px;${SANS}font-size:14px;line-height:20px;color:#5a5a56;">${e.fallback}</td>
</tr>
<tr>
<td style="padding:6px 32px 32px 32px;${SANS}font-size:13px;line-height:20px;color:#171717;word-break:break-all;"><a href="${href}" target="_blank" style="color:#171717;text-decoration:underline;">${href}</a></td>
</tr>
</table>`
}

// Same frame as supabase/templates: the card on a grey page, then the footer line.
export function renderReplyEmail(t: Translate, link: string, locale: Locale): ReplyEmail {
  const subject = t('subject')
  const lines: Lines = { title: t('title'), body: t('body'), button: t('button'), fallback: t('fallback'), footer: t('footer') }
  const e = Object.fromEntries(Object.entries(lines).map(([key, value]) => [key, escapeHtml(value)])) as Lines
  const html = `<!DOCTYPE html>
<html lang="${locale === 'zh' ? 'zh-Hans' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f2;">
<tr>
<td align="center" style="padding:32px 16px;">
${card(e, escapeHtml(link))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr>
<td style="padding:24px 32px 0 32px;${SANS}font-size:12px;line-height:18px;color:#6b6b66;">${e.footer}</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`
  const text = `${lines.title}\n\n${lines.body}\n\n${lines.button}: ${link}\n\n${lines.footer}\n`
  return { subject, html, text }
}

type Recipient = { email: string; locale: Locale }

// The author's address and language. No email (a phone sign-up) or an unconfirmed one → null:
// an unconfirmed address may not belong to the account holder.
async function recipientOf(db: SupabaseClient, userId: string): Promise<Recipient | null> {
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error) throw error
  const user = data.user
  if (!user?.email || !user.email_confirmed_at) return null
  return {
    email: user.email,
    locale: metadataLocale({ user_metadata: user.user_metadata ?? {} }) ?? DEFAULT_LOCALE,
  }
}

export async function notifyTicketReply(deps: ReplyEmailDeps, ticketId: string): Promise<ReplyEmailOutcome> {
  if (!deps.apiKey) {
    logger.info('ticket reply email skipped: RESEND_API_KEY unset', {
      ticketId,
    })
    return 'skipped'
  }
  try {
    const authorId = await ticketAuthor(deps.db, ticketId)
    const recipient = authorId ? await recipientOf(deps.db, authorId) : null
    if (!recipient) return 'skipped'
    const t = await deps.translate(recipient.locale)
    const email = renderReplyEmail(t, ticketLink(deps.origin, ticketId, recipient.locale), recipient.locale)
    const response = await (deps.fetch ?? fetch)(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: deps.from,
        to: [recipient.email],
        ...email,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      logger.error('ticket reply email failed', {
        ticketId,
        status: response.status,
        detail,
      })
      return 'failed'
    }
    return 'sent'
  } catch (error) {
    logger.error('ticket reply email failed', { ticketId, error })
    return 'failed'
  }
}
