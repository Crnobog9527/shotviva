import type { Translate } from '@/core/translate'

// Test translator: returns the key (plus the values as JSON) so module tests check which
// message a helper picks without importing site/ messages. The English wording itself is
// checked against site/messages/en.json in src/app/app-messages.test.ts.
export function echoTranslate(known: readonly string[] = []): Translate {
  const t = (key: string, values?: Record<string, string | number | Date>) => (values ? `${key} ${JSON.stringify(values)}` : key)
  return Object.assign(t, { has: (key: string) => known.includes(key) })
}
