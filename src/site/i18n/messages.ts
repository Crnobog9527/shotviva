import type { Locale } from '@/core/i18n'

import en from '../messages/en.json'

// A message is a string, or in a production build next-intl's precompiled form of one (an array,
// next.config.ts); a namespace is a plain object of those.
type Message = string | unknown[]
type Messages = { [key: string]: Message | Messages }

const isNamespace = (value: Message | Messages | undefined): value is Messages =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// English is complete by definition; a key missing from zh.json falls back to the English
// string rather than an error (a test keeps zh.json complete, ARCHITECTURE §17).
export function overlay(base: Messages, top: Messages): Messages {
  const merged: Messages = { ...base }
  for (const [key, value] of Object.entries(top)) {
    const under = base[key]
    merged[key] = isNamespace(value) && isNamespace(under) ? overlay(under, value) : value
  }
  return merged
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === 'en') return en
  const zh = (await import('../messages/zh.json')).default as Messages
  return overlay(en, zh)
}
