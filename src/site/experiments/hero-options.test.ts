import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { experimentRegistry, HERO_DEFAULT_OPTION, HERO_OPTIONS, heroOptionContent } from '.'
import { FIRST_FRAMES } from '../content/first-frames.generated'

const picture = (src: string) => existsSync(join(process.cwd(), 'public', src))

describe('home hero options (ARCHITECTURE §16.5)', () => {
  it('has content in both languages for every option but tote (the page content hero), the default included: real files and an inline first frame, or live templates', () => {
    expect(HERO_DEFAULT_OPTION).toBe('food')
    for (const { id } of HERO_OPTIONS.filter((option) => option.id !== 'tote')) {
      for (const locale of ['en', 'zh'] as const) {
        const content = heroOptionContent(id, locale)
        expect(content, `${id} ${locale}`).not.toBeNull()
        // Every option has static pictures: its own, or the fallback for its live templates.
        expect(content!.hero, `${id} ${locale}`).toBeDefined()
        if (content!.hero) {
          const { before, after } = content!.hero
          expect(picture(before.src) && picture(after.src)).toBe(true)
          expect(before.firstFrame).toBe(FIRST_FRAMES[before.src])
        }
        for (const item of content!.strip?.items ?? []) expect(picture(item.before.src) && picture(item.after.src)).toBe(true)
      }
    }
  })

  it('shows restaurants a first screen and seven more pairs below it, Western dishes in English and Chinese ones on /zh', () => {
    for (const [locale, prefix] of [['en', '/home/food-'], ['zh', '/home/cn-']] as const) {
      const food = heroOptionContent('food', locale)!
      expect(food.strip?.items).toHaveLength(7)
      for (const image of [...(food.hero ? [food.hero.before, food.hero.after] : []), ...(food.strip?.items ?? []).flatMap((item) => [item.before, item.after])]) {
        expect(image.src.startsWith(prefix)).toBe(true)
      }
    }
    expect(heroOptionContent('food', 'en')!.hero?.scenes).toBeUndefined()
  })

  it('reads the /zh hero dishes live from the three templates the Owner picked, with Chinese words and no prices', () => {
    const { live } = heroOptionContent('food', 'zh')!
    expect(live!.scenes.map((scene) => scene.templateId)).toEqual(['cn-pedestal-fog', 'cn-deep-prawn-green', 'cn-warm-lobed-runner'])
    for (const scene of live!.scenes) {
      for (const text of [scene.phone, scene.ai, scene.caption]) expect(text).toMatch(/[\u4e00-\u9fff]/)
      expect(scene.caption).not.toMatch(/[0-9]|积分|¥|元/)
    }
  })

  it('registers every option on the hero surface', () => {
    expect(experimentRegistry[0]?.options.map((option) => option.id)).toEqual(['food', 'tote', 'art-style'])
  })

  it('keeps a static Chinese dish with its first frame as the /zh fallback, never the tote', () => {
    const { hero, live } = heroOptionContent('food', 'zh')!
    expect(hero?.before.src).toBe('/home/cn-hero-1-photo.webp')
    expect(hero?.after.src).toBe('/home/cn-hero-1-ai.webp')
    expect(hero?.before.firstFrame).toBe(FIRST_FRAMES['/home/cn-hero-1-photo.webp'])
    expect(picture(hero!.before.src) && picture(hero!.after.src)).toBe(true)
    // The same dish, words and all, as the first live pair.
    expect([hero?.before.alt, hero?.after.alt, hero?.caption]).toEqual([live!.scenes[0]!.phone, live!.scenes[0]!.ai, live!.scenes[0]!.caption])
  })
})
