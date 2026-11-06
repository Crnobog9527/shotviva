import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { site } from './site.config'

// The Supabase auth email templates are plain HTML outside the app, so nothing else stops them
// drifting from the footer facts in site.config or falling back to a supabase.co link.
const TEMPLATES = {
  'confirm-signup': 'signup',
  'reset-password': 'recovery',
  'change-email': 'email_change',
  'magic-link': 'magiclink',
} as const

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../supabase/templates/${name}.html`, import.meta.url)), 'utf8')
const config = readFileSync(fileURLToPath(new URL('../../supabase/config.toml', import.meta.url)), 'utf8')

describe.each(Object.entries(TEMPLATES))('supabase/templates/%s.html', (name, type) => {
  const html = read(name)

  it('links to /auth/confirm on our origin with the token hash and its own type', () => {
    expect(html).toContain(`printf "%s&token_hash=%s&type=${type}" .RedirectTo .TokenHash`)
    expect(html).toContain(`printf "%s/auth/confirm?token_hash=%s&type=${type}" .SiteURL .TokenHash`)
    expect(html).not.toContain('.ConfirmationURL')
    expect(html).not.toMatch(/supabase\.co/)
  })

  it('shows one button and the same URL as text', () => {
    expect(html.match(/href="\{\{ \$link \}\}"/g)).toHaveLength(2)
    expect(html).toContain('>{{ $link }}</a>')
  })

  it('says not to reply, links the support address, and carries the copyright line, with nothing that tracks or needs images', () => {
    const { contactEmail, name: brandName } = site.brand
    // Owner 2026-11-07: auth emails come from mail@ (spec #175); replies belong at support@.
    expect(html).toContain("This is an automated email, please don't reply. Need help? Contact {{ end }}")
    expect(html).toContain('这是系统自动发送的邮件，请勿直接回复。如需帮助，请联系 {{ else }}')
    expect(html).toContain(`<a href="mailto:${contactEmail}" style="color:#6b6b66;text-decoration:underline;">${contactEmail}</a></td>`)
    expect(html).not.toContain('Questions? Email')
    expect(html).toContain(`Copyright &copy; 2026 ${brandName}. All rights reserved.`)
    expect(html).not.toMatch(/<img|<script|<link|url\(/i)
  })

  it('has a Chinese branch for every line, chosen by user_metadata.locale (ARCHITECTURE §7)', () => {
    expect(html).toContain('{{- $zh := eq .Data.locale "zh" -}}')
    expect(html).toContain('<html lang="{{ if $zh }}zh-Hans{{ else }}en{{ end }}">')
    const branches = html.match(/\{\{ if \$zh \}\}([^{]*)\{\{ else \}\}/g) ?? []
    // 9 since the no-reply footer line (one branch, no trailing full-stop branch), 2026-11-07.
    expect(branches.length).toBeGreaterThanOrEqual(9)
    // Every text cell between tags is a language branch: no bare English sentence is left.
    const bare = [...html.matchAll(/>([^<>{}]*[A-Za-z]{3,}[^<>{}]*)</g)].map((m) => m[1]?.trim()).filter((text) => text && text !== 'Shotviva' && !text.includes('@'))
    expect(bare).toEqual([])
  })

  it('is wired into the local Supabase config', () => {
    expect(config).toContain(`content_path = "./supabase/templates/${name}.html"`)
  })
})
