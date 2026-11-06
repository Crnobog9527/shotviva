import type { Locale } from '@/core/i18n'

import en from '../messages/en.json'

type Messages = { [key: string]: string | Messages }

// English is complete by definition; a key missing from zh.json falls back to the English
// string rather than an error (a test keeps zh.json complete, ARCHITECTURE §17).
function overlay(base: Messages, top: Messages): Messages {
  const merged: Messages = { ...base }
  for (const [key, value] of Object.entries(top)) {
    const under = base[key]
    merged[key] = typeof value === 'object' && typeof under === 'object' ? overlay(under, value) : value
  }
  return merged
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === 'en') return en
  const zh = (await import('../messages/zh.json')).default as Messages
  return overlay(en, zh)
}
