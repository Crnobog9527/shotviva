// Create's app shell (ARCHITECTURE §18.3) must carry nothing of any account: the service worker
// keeps it and shows it to whoever opens Create on that phone. Checked on every prerendered file of
// the shell route (HTML and RSC segments) after `next build`, by app-shell-check.ts. Pure.

// Addresses the shell may name: the public catalogue file and the version check.
const PUBLIC_API = /^\/api\/(catalogue\/public\/|version$)/
// Placeholder and contact addresses are fine; any other email is someone's.
const ALLOWED_EMAIL_DOMAINS = ['company.com', 'example.com']

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.[A-Za-z.]{2,})/g
const API = /\/api\/[A-Za-z0-9/_.-]+/g
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// The signed-in parts' own markers: the real balance chip, the Admin item.
const SIGNED_IN = [/data-coin/, /data-admin-entry/]
// Session material in any form.
const SESSION = [/sb-[a-z0-9]+-auth-token/i, /access_token/, /refresh_token/]

export function shellPrivacyProblems(text: string, siteDomain: string): string[] {
  const problems: string[] = []
  for (const match of text.matchAll(EMAIL)) {
    const domain = (match[1] ?? '').toLowerCase()
    if (domain !== siteDomain && !ALLOWED_EMAIL_DOMAINS.includes(domain)) problems.push(`an email address (${match[0]})`)
  }
  for (const match of text.matchAll(API)) if (!PUBLIC_API.test(match[0])) problems.push(`a signed-in API address (${match[0]})`)
  const ids = [...new Set([...text.matchAll(UUID)].map((match) => match[0]))]
  if (ids.length > 0) problems.push(`an id that may be an account's (${ids[0]})`)
  for (const marker of SIGNED_IN) if (marker.test(text)) problems.push(`a signed-in part (${marker.source})`)
  for (const marker of SESSION) if (marker.test(text)) problems.push(`session material (${marker.source})`)
  return [...new Set(problems)]
}
