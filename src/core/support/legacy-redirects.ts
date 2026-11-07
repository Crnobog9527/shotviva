import { DEFAULT_LOCALE, LOCALES } from '../i18n/locales'

// The old Help & feedback pages (T27) are deep links into the account page's dialog now
// (ARCHITECTURE §10 「在弹窗里完成」, T68): /account/help → My tickets, …/new → New ticket,
// …/<ticket id> → that ticket, anything else under it → My tickets. Declared in next.config.ts,
// so they answer 307 before the proxy and any rendering, in each language; signed-out
// visitors then meet the proxy's login redirect on /account, which keeps the ?help= query.

type Redirect = { source: string; destination: string; permanent: false }

const TICKET_ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

function forPrefix(prefix: string): Redirect[] {
  const to = (help: string): string => `${prefix}/account?help=${help}`
  return [
    { source: `${prefix}/account/help`, destination: to('list'), permanent: false },
    { source: `${prefix}/account/help/new`, destination: to('new'), permanent: false },
    { source: `${prefix}/account/help/:id(${TICKET_ID})`, destination: to(':id'), permanent: false },
    { source: `${prefix}/account/help/:rest*`, destination: to('list'), permanent: false },
  ]
}

export function legacyHelpRedirects(): Redirect[] {
  return LOCALES.flatMap((locale) => forPrefix(locale === DEFAULT_LOCALE ? '' : `/${locale}`))
}
