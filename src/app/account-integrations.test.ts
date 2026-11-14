import { readFileSync } from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'
import { NextIntlClientProvider } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { readLinkStatus, type LinkStatus } from '@/core/partner'
import { graylumIntroLinks, IntegrationsPanel } from '@/core/partner/ui'
import { IntroBody } from '@/core/partner/ui/graylum-intro/intro-body'
import { ViewLink } from '@/core/partner/ui/graylum-intro/intro-dialog'
import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'
import { site } from '@/site/site.config'

type Row = { linked_at: string | null; revoked_at: string | null } | null

// Just the chain readLinkStatus uses, so each case runs the real "active = linked and not revoked"
// rule. The revoke write itself is covered against a real database in tests/db/partner-link.
function clientWith(row: Row): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
  return { from: () => chain } as unknown as SupabaseClient
}

const disconnect = async () => {}
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof zh; timeZone: string }>
const inZh = (node: ReactElement) => renderToStaticMarkup(createElement(Intl, { locale: 'zh', messages: zh, timeZone: 'UTC' }, node))

const PROD_VIEW = 'https://www.graylum.com/?from=shotviva&utm_source=shotviva&utm_medium=integration&utm_campaign=graylum&utm_content=view'
const PROD_CONNECT = 'https://www.graylum.com/app/integrations?from=shotviva&utm_source=shotviva&utm_medium=integration&utm_campaign=graylum&utm_content=connect'
const STAGING_VIEW = 'https://auth-staging.graylum.com/?from=shotviva&utm_source=shotviva&utm_medium=integration&utm_campaign=graylum&utm_content=view'
const STAGING_CONNECT = 'https://auth-staging.graylum.com/app/integrations?from=shotviva&utm_source=shotviva&utm_medium=integration&utm_campaign=graylum&utm_content=connect'
const links = graylumIntroLinks('production')

const panel = (graylum: LinkStatus) => inZh(createElement(IntegrationsPanel, { graylum, links, disconnect }))
const status = async (row: Row) => panel(await readLinkStatus(clientWith(row), 'user-1'))
const badge = (html: string) => html.match(/data-status="([^"]+)"[^>]*>([^<]+)</)?.slice(1)
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'")
const body = (connected: boolean) =>
  inZh(createElement(DialogPrimitive.Root, { open: true }, createElement(IntroBody, { connected, links, disconnect, onView: () => {} })))

const TAGLINE = 'Graylum 是每个人的专属 AI 自媒体陪跑教练，运营从此交给 AI 教练，你只管专心输出你擅长的内容。'
const LINKED = '2026-11-01T10:00:00Z'

describe('连接的应用: the Graylum card', () => {
  it('is one button: icon, name, the one-line intro, status and chevron', async () => {
    const html = await status(null)
    expect(html).toContain('>连接的应用</h2>')
    expect(html).toMatch(/<li><button type="button" aria-haspopup="dialog"/)
    expect(html).toContain('src="/partners/graylum/icon.webp"')
    expect(html).toContain('>Graylum</b>')
    expect(html).toMatch(new RegExp(`class="[^"]*line-clamp-2[^"]*">${TAGLINE}</small>`))
    expect(html).not.toContain('<details')
  })

  it('says 已连接 for an active link and 未启用 otherwise', async () => {
    expect(badge(await status({ linked_at: LINKED, revoked_at: null }))).toEqual(['enabled', '已连接'])
    expect(badge(await status(null))).toEqual(['not-enabled', '未启用'])
    expect(badge(await status({ linked_at: LINKED, revoked_at: '2026-11-02T10:00:00Z' }))).toEqual(['not-enabled', '未启用'])
  })

  it('flips to 未启用 once 断开 has revoked the link and the page re-reads it', async () => {
    const row = { linked_at: LINKED, revoked_at: null as string | null }
    expect(badge(await status(row))).toEqual(['enabled', '已连接'])
    row.revoked_at = '2026-11-06T09:00:00Z' // what revokeLink writes
    expect(badge(await status(row))).toEqual(['not-enabled', '未启用'])
  })
})

describe('Graylum introduction links', () => {
  it('are these exact URLs in production', () => {
    expect(graylumIntroLinks('production')).toEqual({ view: PROD_VIEW, connect: PROD_CONNECT })
  })

  it('go to Graylum staging, same parameters, on every other deployment', () => {
    for (const env of ['preview', 'development', undefined]) expect(graylumIntroLinks(env)).toEqual({ view: STAGING_VIEW, connect: STAGING_CONNECT })
  })

  it('stay on hosts the partner config already trusts', () => {
    for (const url of [PROD_VIEW, STAGING_VIEW]) expect(site.partners.graylum?.returnToHosts).toContain(new URL(url).hostname)
  })

  it('open in a new tab from the foot (去看看 Graylum) and the not-connected card (去 Graylum 连接)', () => {
    const foot = inZh(createElement(ViewLink, { href: links.view, primary: true }))
    expect(foot).toContain(`href="${PROD_VIEW.replace(/&/g, '&amp;')}" target="_blank" rel="noopener noreferrer"`)
    expect(text(foot)).toContain('去看看 Graylum')
    expect(body(false)).toContain(`href="${PROD_CONNECT.replace(/&/g, '&amp;')}" target="_blank" rel="noopener noreferrer"`)
    expect(text(body(false))).toContain('去 Graylum 连接')
  })
})

describe('Graylum introduction body', () => {
  it('says the intro, the idea and the connection word for word', () => {
    const connected = text(body(true))
    expect(connected).toContain(TAGLINE)
    expect(connected).toContain('每个人都有值得被看见的本事：一手好菜、一门手艺、一段别人没走过的路。')
    expect(connected).toContain('已连接：在 Graylum 的对话里配图，会直接用你的 Shotviva 积分出图。')
    expect(connected).toContain('断开')
    expect(connected).not.toContain('去 Graylum 连接')
    expect(text(body(false))).toContain('未连接：在 Graylum 的集成页连接后，就能在 Graylum 写内容时直接用 Shotviva 出图。')
  })

  it('shows seven screenshots as named buttons, lazy thumbnails with their boxes held', () => {
    const html = body(true)
    const buttons = [...html.matchAll(/<button type="button" data-shot="[^"]+" aria-label="([^"]+)"/g)].map(match => match[1])
    expect(buttons).toEqual(['看大图：路线图首页', '看大图：口播建议稿', '看大图：小红书图文成稿', '看大图：视频分镜', '看大图：探店笔记成稿', '看大图：对话里用 Shotviva 出图', '看大图：功能广场'])
    const thumbs = [...html.matchAll(/<img src="([^"]+)" alt="" width="(\d+)" height="(\d+)" loading="lazy"/g)]
    expect(thumbs).toHaveLength(7)
    expect(html).not.toContain('-large.webp')
  })

  it('pairs each use with its title and line', () => {
    const words = text(body(true))
    for (const line of ['写口播有想法但不知道怎么开口的时候', '写图文想发笔记却写不出能直接发的稿子的时候', '拍视频稿子定了，不知道每个镜头怎么拍的时候', '一稿多用同一件事想发到不同平台的时候', '写完就配图内容写好了还缺一张像样配图的时候', '更多工具定位、复盘、剪辑建议等都在这里。'])
      expect(words).toContain(line)
    expect(words).toContain('从定位到 30 天行动计划，六步帮你找准方向。')
    expect(words).toContain('Shotviva 只把你的 Shotviva 账号 ID 交给 Graylum，Graylum 拿不到你的 Shotviva 密码；')
  })

  it('has no prices or credit amounts in either language', () => {
    for (const messages of [zh, en]) {
      const copy = JSON.stringify(messages.partner.intro)
      expect(copy).not.toMatch(/[$¥￥€]|\d+\s*(积分|credits?)|去购买/i)
    }
  })
})

// WCAG 2.1 relative luminance and contrast, on the colours the page really uses (globals-body.css).
const css = readFileSync(new URL('./globals-body.css', import.meta.url), 'utf8')
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
function rgba(value: string): [number, number, number, number] {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (hex) return [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16)).concat(1) as [number, number, number, number]
  const parts = value.match(/rgba\(([^)]+)\)/)?.[1]?.split(',').map(Number)
  if (!parts || parts.length !== 4) throw new Error(`not a colour: ${value}`)
  return parts as [number, number, number, number]
}
const over = (fg: string, bg: string) => {
  const [r, g, b, a] = rgba(fg)
  const ground = rgba(bg)
  return [r, g, b].map((channel, at) => channel * a + (ground[at] ?? 0) * (1 - a))
}
const luminance = (rgb: number[]) => {
  const [r = 0, g = 0, b = 0] = rgb.map(c => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (fg: string, bg: string) => {
  const [a, b] = [luminance(over(fg, bg)), luminance(over(bg, bg))].sort((x, y) => y - x)
  return (a! + 0.05) / (b! + 0.05)
}

describe('Graylum introduction contrast', () => {
  it('keeps the brand idea (bone dim) and captions (ash) at 4.5:1 or more on the dialog and its card', () => {
    for (const ground of ['popover', 'card']) {
      expect(contrast(token('bone-dim'), token(ground))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token('muted-foreground'), token(ground))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token('foreground'), token(ground))).toBeGreaterThanOrEqual(7)
    }
  })

  it('keeps the safelight action label readable', () => {
    expect(contrast(token('primary-foreground'), token('primary'))).toBeGreaterThanOrEqual(4.5)
  })
})
