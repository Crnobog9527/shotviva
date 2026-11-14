// Message namespaces that stay on the server: the root layout hands every other one to the
// client provider. `adminEntry` labels the way into /admin, which only admins are shown and
// which a normal user's page must not carry at all (ARCHITECTURE §10, spec #186), not even as
// an unused string in the serialized messages. Affiliate pages translate on the server too, and so
// does the public gallery (T108), so its text adds nothing to any other page.
export const SERVER_ONLY_NAMESPACES = ['adminEntry', 'affiliate', 'affiliateAgreement', 'gallery', 'share'] as const

// What no client component on a public page (marketing, sign-in, the root error and not-found
// pages) reads: whole namespaces, and subtrees of `app` that only the logged-in app uses. The
// root layout leaves them out, and the (app) layout hands the app the full set in a nested
// provider. Every page's HTML carries its messages in the RSC payload, so on /zh this halves
// them (38 → 19 KB) for visitors downloading the page at a few KB/s from mainland China
// (2026-11-12). public-messages.test.ts fails if public client code starts using one of these.
export const APP_ONLY_NAMESPACES = ['partner', 'legal'] as const
export const APP_ONLY_APP_KEYS = [
  'gated',
  'matrix',
  'batchZip',
  'result',
  'states',
  'account',
  'support',
  'wishlist',
  'photos',
  'edit',
  'checkout',
  'create',
  'series',
  'work',
  'share',
  'wait',
  'notify',
] as const

type Messages = Record<string, unknown>

const without = <T extends Messages>(messages: T, keys: readonly string[]): Partial<T> =>
  Object.fromEntries(Object.entries(messages).filter(([key]) => !keys.includes(key))) as Partial<T>

export function clientMessages<T extends Messages>(messages: T): Partial<T> {
  return without(messages, SERVER_ONLY_NAMESPACES)
}

// The root layout's set: clientMessages without what only the logged-in app reads.
export function publicClientMessages<T extends Messages>(messages: T): Partial<T> {
  const client: Messages = without(clientMessages(messages), APP_ONLY_NAMESPACES)
  const app = client.app
  if (app && typeof app === 'object') client.app = without(app as Messages, APP_ONLY_APP_KEYS)
  return client as Partial<T>
}
