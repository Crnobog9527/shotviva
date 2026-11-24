import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { experimentRegistry, HERO_DEFAULT_OPTION, HERO_OPTIONS, heroOptionContent } from '.'
import { FIRST_FRAMES } from '../content/first-frames.generated'

const picture = (src: string) => existsSync(join(process.cwd(), 'public', src))

describe('home hero options (ARCHITECTURE §16.5)', () => {
  it('has content in both languages for every option but tote (the page content hero), the default included, with real files and an inline first frame', () => {
    expect(HERO_DEFAULT_OPTION).toBe('food')
    for (const { id } of HERO_OPTIONS.filter((option) => option.id !== 'tote')) {
      for (const locale of ['en', 'zh'] as const) {
        const content = heroOptionContent(id, locale)
        expect(content, `${id} ${locale}`).not.toBeNull()
        const { before, after } = content!.hero
        expect(picture(before.src) && picture(after.src)).toBe(true)
        expect(before.firstFrame).toBe(FIRST_FRAMES[before.src])
        for (const item of content!.strip?.items ?? []) expect(picture(item.before.src) && picture(item.after.src)).toBe(true)
      }
    }
  })

  it('shows restaurants a first screen and seven more pairs below it, Western dishes in English and Chinese ones on /zh', () => {
    for (const [locale, prefix] of [['en', '/home/food-'], ['zh', '/home/cn-']] as const) {
      const food = heroOptionContent('food', locale)!
      expect(food.strip?.items).toHaveLength(7)
      for (const image of [food.hero.before, food.hero.after, ...(food.strip?.items ?? []).flatMap((item) => [item.before, item.after])]) {
        expect(image.src.startsWith(prefix)).toBe(true)
      }
    }
    expect(heroOptionContent('food', 'en')!.hero.scenes).toBeUndefined()
  })

  it('turns three Chinese dishes on /zh, phone photo and result together, the first pair being the preloaded one', () => {
    const { hero } = heroOptionContent('food', 'zh')!
    const items = hero.scenes!.items
    expect(items).toHaveLength(3)
    expect(items[0].image.src).toBe(hero.after.src)
    expect(items[0].before?.src).toBe(hero.before.src)
    expect(hero.before.firstFrame).toBe(FIRST_FRAMES['/home/cn-hero-1-photo.webp'])
    for (const [index, scene] of items.entries()) {
      const file = [1, 3, 4][index]
      expect(scene.before?.src).toBe(`/home/cn-hero-${file}-photo.webp`)
      expect(scene.image.src).toBe(`/home/cn-hero-${file}-ai.webp`)
      expect(picture(scene.before!.src) && picture(scene.image.src)).toBe(true)
      expect(scene.caption).not.toMatch(/[0-9]|积分|¥|元/)
    }
  })

  it('registers every option on the hero surface', () => {
    expect(experimentRegistry[0]?.options.map((option) => option.id)).toEqual(['food', 'tote', 'art-style'])
  })
})
