// Message namespaces that stay on the server: the root layout hands every other one to the
// client provider. `adminEntry` labels the way into /admin, which only admins are shown and
// which a normal user's page must not carry at all (ARCHITECTURE §10, spec #186), not even as
// an unused string in the serialized messages. Affiliate pages translate on the server too, and so
// does the public gallery (T108), so its text adds nothing to any other page.
export const SERVER_ONLY_NAMESPACES = ['adminEntry', 'affiliate', 'affiliateAgreement', 'gallery'] as const

export function clientMessages<T extends Record<string, unknown>>(messages: T): Partial<T> {
  return Object.fromEntries(Object.entries(messages).filter(([key]) => !(SERVER_ONLY_NAMESPACES as readonly string[]).includes(key))) as Partial<T>
}
