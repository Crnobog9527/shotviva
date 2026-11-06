import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOCALES, localizePath } from '@/core/i18n'

import en from '../messages/en.json'
import zh from '../messages/zh.json'
import { contentPages } from '../content'
import { site } from '../site.config'
import { loadMessages } from './messages'

// The Chinese keyword map (T22, AGENTS §9): the only source of indexable /zh pages. Rows built
// with T21 are the ones whose batch is 「第1周（随 T21）」.
function zhCsvLaunchUrls(): string[] {
  const csv = readFileSync(join(process.cwd(), 'seo资料', 'Shotviva 页面与主词映射（中文口径）.csv'), 'utf8')
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(','))
    .filter(([batch, url]) => batch?.includes('随 T21') && url?.startsWith('/zh'))
    .map(([, url]) => url as string)
}

const APP = join(process.cwd(), 'src', 'app', '[locale]')

// A zhPaths entry must be a real page (or the connect form's route) of the [locale] tree, or
// an inner SEO page rendered by (marketing)/[slug].
function routeExists(path: string): boolean {
  const dir = path === '/' ? '' : path
  const files = ['(marketing)', '(app)'].flatMap((group) => ['page.tsx', 'route.ts'].map((f) => join(APP, group, dir, f)))
  return files.some((file) => existsSync(file)) || contentPages.some((page) => `/${page.slug}` === path)
}

describe('locales in site.config (ARCHITECTURE §17)', () => {
  it('enables exactly English and Simplified Chinese, English first', () => {
    expect(site.locales.enabled).toEqual([...LOCALES])
    expect(site.locales.default).toBe('en')
  })

  it('translates only routes that exist', () => {
    for (const path of site.locales.zhPaths) expect(routeExists(path), path).toBe(true)
  })

  it('keeps legal pages and SEO inner pages English-only', () => {
    for (const path of ['/terms', '/privacy', '/refund-policy', '/acceptable-use', '/ai-restaurant-menu', '/admin']) {
      expect(site.locales.zhPaths).not.toContain(path)
    }
  })

  it('indexes exactly the /zh pages the Chinese keyword map launches with T21', () => {
    const indexable = site.indexing.zhIndexablePaths.map((path) => localizePath(path, 'zh'))
    expect(indexable.sort()).toEqual(zhCsvLaunchUrls().sort())
    for (const path of site.indexing.zhIndexablePaths) expect(site.locales.zhPaths).toContain(path)
  })
})

type Tree = { [key: string]: string | Tree }

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  )
}

describe('zh messages', () => {
  it('has no key that English lacks', () => {
    const english = new Set(keys(en as Tree))
    expect(keys(zh as Tree).filter((key) => !english.has(key))).toEqual([])
  })

  it('falls back to English for a missing key, never to an error', async () => {
    const messages = (await loadMessages('zh')) as Tree
    expect((messages.locale as Tree).banner).toEqual((zh as Tree).locale && ((zh as Tree).locale as Tree).banner)
    expect(keys(messages)).toEqual(expect.arrayContaining(keys(en as Tree)))
  })
})
