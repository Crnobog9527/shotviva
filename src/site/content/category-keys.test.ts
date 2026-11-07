import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import { CATEGORY } from './landing-shared'

// T75: categories live in template_categories; the code only refers to them by key. The six
// keys seeded by the migration are the only ones code may name (landing pages, the workspace's
// note examples); a category added in admin falls back where code has nothing for it.
const seed = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0580_template_categories.sql'), 'utf8')
const rows = [...seed.matchAll(/^ {2}\('([a-z0-9-]+)', '([^']+)', '([^']+)',[\s\S]*?'(pair|compare)', (\d+)\)/gm)]
const seeded = rows.map((row) => row[1])

describe('category keys in code', () => {
  it('seeds the six categories once each, 画风 the only drag compare, in home order', () => {
    expect(seeded).toEqual(['art-styles', 'food-drink', 'products-resale', 'beauty-skincare', 'rooms-spaces', 'pets'])
    expect(rows.filter((row) => row[4] === 'compare').map((row) => row[1])).toEqual(['art-styles'])
    expect(rows.map((row) => row[3])).toEqual(['画风', '餐饮', '商品与二手', '美妆护肤', '房间与空间', '宠物'])
  })

  it('names only seeded keys on the landing pages', () => {
    for (const key of Object.values(CATEGORY)) expect(seeded).toContain(key)
  })

  it('keys the note examples by category key in both languages, with a fallback', () => {
    for (const messages of [en, zh]) {
      const keys = Object.keys(messages.app.workspace.notePlaceholder).filter((key) => key !== 'fallback')
      expect(keys.sort()).toEqual([...seeded].sort())
    }
  })

  it('keeps no category names in the messages: they come from the database', () => {
    expect('categories' in en.app).toBe(false)
    expect('categories' in zh.app).toBe(false)
  })
})
