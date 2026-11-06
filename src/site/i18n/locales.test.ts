import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOCALES, localizePath } from '@/core/i18n'

import en from '../messages/en.json'
import zh from '../messages/zh.json'
import { contentPages } from '../content'
import { site } from '../site.config'
import { messageArguments } from './icu-args'
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
  const files = ['(marketing)', '(auth)', '(app)'].flatMap((group) => ['page.tsx', 'route.ts'].map((f) => join(APP, group, dir, f)))
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

  // Every SEO inner page has a Chinese version (ARCHITECTURE §17, T44); the legal pages get
  // theirs with T45; the admin stays Chinese-only and unprefixed.
  it('keeps the legal pages and the admin out of /zh for now', () => {
    for (const path of ['/terms', '/privacy', '/refund-policy', '/acceptable-use', '/admin']) {
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

function lookup(tree: Tree, key: string): string {
  return key.split('.').reduce<Tree | string>((node, part) => (node as Tree)[part] as Tree | string, tree) as string
}

// Words that may stay in Latin script on a Chinese page (建站规格 §6.1 rule 3): the brand,
// AI, product and payment names, units and file formats.
const LATIN_OK = /^(Shotviva|Graylum|Google|Apple Pay|Google Pay|AI|logo|DELETE|MiSans|English|JPG|PNG|WebP|MB|px|USD|Pro|Max)$/

describe('messageArguments', () => {
  it('reads arguments and tags, not branch bodies', () => {
    expect(messageArguments('{count, plural, one {credit} other {credits}}')).toEqual(['{count}'])
    expect(messageArguments('Renews {period, select, year {yearly} other {monthly}} at {price}')).toEqual(['{period}', '{price}'])
    expect(messageArguments('{n, plural, =0 {} other {# in {place}}}<b>x</b>')).toEqual(['<b>', '{n}', '{place}'])
    expect(messageArguments('{px, number, ::group-off} px')).toEqual(['{px}'])
  })
})

describe('zh messages', () => {
  it('translates every English key', () => {
    const chinese = new Set(keys(zh as Tree))
    expect(keys(en as Tree).filter((key) => !chinese.has(key))).toEqual([])
  })

  it('has no key that English lacks', () => {
    const english = new Set(keys(en as Tree))
    expect(keys(zh as Tree).filter((key) => !english.has(key))).toEqual([])
  })

  it('keeps every ICU argument and rich-text tag', () => {
    const broken = keys(en as Tree).filter(
      (key) => messageArguments(lookup(en as Tree, key)).join() !== messageArguments(lookup(zh as Tree, key)).join(),
    )
    expect(broken).toEqual([])
  })

  it('leaves no English sentence behind (one language per page)', () => {
    const leftovers = keys(zh as Tree).filter((key) => {
      const text = lookup(zh as Tree, key).replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '').replace(/<\/?[a-z]+>/g, '')
      const words = text.match(/[A-Za-z][A-Za-z']+/g) ?? []
      return words.some((word) => !LATIN_OK.test(word)) && !/[\u4e00-\u9fff]/.test(text)
    })
    expect(leftovers).toEqual([])
  })

  it('falls back to English for a missing key, never to an error', async () => {
    const messages = (await loadMessages('zh')) as Tree
    expect(keys(messages)).toEqual(expect.arrayContaining(keys(en as Tree)))
  })
})
