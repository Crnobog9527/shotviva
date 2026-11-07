import type { LegalBlock, LegalPage, LegalText } from './legal-page'

// A legal page as plain text (T82): the dispute evidence quotes the refund policy word for word
// (Stripe's refund_policy_disclosure is text). Links keep their label and gain the absolute URL,
// so a bank reviewer can follow them; mailto: links show the address only.

function linkText(link: { href: string; label: string }, origin: string): string {
  if (link.href.startsWith('mailto:')) return link.label
  const url = link.href.startsWith('/') ? `${origin}${link.href}` : link.href
  return url === link.label ? url : `${link.label} (${url})`
}

function text(value: LegalText, origin: string): string {
  if (typeof value === 'string') return value
  return value.map((part) => (typeof part === 'string' ? part : linkText(part, origin))).join('')
}

function block(value: LegalBlock, origin: string): string {
  if (typeof value === 'string') return value
  if ('list' in value) return value.list.map((item) => `- ${text(item, origin)}`).join('\n')
  if ('lines' in value) return value.lines.join('\n')
  return text(value, origin)
}

export function legalPlainText(page: LegalPage, origin: string): string {
  const intro = page.intro.map((b) => block(b, origin))
  const sections = page.sections.map((s) => [s.heading, ...s.blocks.map((b) => block(b, origin))].join('\n'))
  return [`${page.h1} (${origin}${page.path}, last updated ${page.lastUpdated})`, ...intro, ...sections].join('\n\n')
}
