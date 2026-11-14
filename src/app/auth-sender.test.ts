import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'
import { site } from '@/site/site.config'

import { sender } from './[locale]/(auth)/sender'

// The check-your-email views name the auth emails' From address: mail@ since 2026-11-07
// (spec #175, ARCHITECTURE §7). The site's contact address stays support@.
describe('auth email sender', () => {
  it('is mail@, not the contact address', () => {
    expect(sender).toBe('Shotviva <mail@shotviva.com>')
    expect(site.brand.contactEmail).toBe('support@shotviva.com')
  })

  it('is what both languages show on the check-your-email views', () => {
    for (const [locale, messages] of [['en', en], ['zh', zh]] as const) {
      const t = createTranslator({ locale, messages, namespace: 'auth.resend' })
      expect(t.markup('from', { sender, b: (chunks) => `<b>${chunks}</b>` })).toContain('<b>Shotviva <mail@shotviva.com></b>')
    }
  })
})
