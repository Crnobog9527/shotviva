import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { matchesPaths } from '@/core/i18n/paths'

import { site } from './site.config'

// Every signed-in page has a Chinese version (ARCHITECTURE §17): a route missing from
// locales.zhPaths is a 404 under /zh, which is how /zh/account/enterprise (#825) and the staff
// invite link /zh/join/org/<token> broke on production. Admin pages are Chinese-only copy at
// unprefixed addresses; /generate/upload-test is a development harness.
const APP_DIR = join(process.cwd(), 'src/app/[locale]/(app)')
const NOT_TRANSLATED = [/^\/admin(\/|$)/, /^\/generate\/upload-test$/]

function pageRoutes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return pageRoutes(path)
    if (entry.name !== 'page.tsx') return []
    const route = '/' + relative(APP_DIR, dir).split(sep).filter((part) => !part.startsWith('(')).join('/')
    return [route === '/' ? '/' : route.replace(/\/$/, '')]
  })
}

describe('zhPaths covers the app pages', () => {
  const routes = pageRoutes(APP_DIR).filter((route) => !NOT_TRANSLATED.some((rule) => rule.test(route)))

  it('finds the app pages', () => {
    expect(routes).toContain('/join/org/[token]')
    expect(routes).toContain('/account/enterprise')
  })

  it.each(routes)('%s has a /zh version', (route) => {
    // A sample value stands in for each [param] segment.
    expect(matchesPaths(route.replace(/\[[^\]]+\]/g, 'sample'), site.locales.zhPaths)).toBe(true)
  })
})

// The purchasing page's transfer contact, verbatim from the Owner (2026-11-22).
describe('enterprise transfer contact', () => {
  it('names the China region manager, the company email and the WeChat ID', () => {
    expect(site.enterprise?.transferContact).toEqual({ name: '倪十三', email: 'simonlee@shotviva.com', wechat: 'crnobogkin' })
  })
})
