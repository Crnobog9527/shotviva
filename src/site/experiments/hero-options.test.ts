import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { experimentRegistry, HERO_DEFAULT_OPTION, HERO_OPTIONS, heroOptionContent } from '.'
import { FIRST_FRAMES } from '../content/first-frames.generated'

const picture = (src: string) => existsSync(join(process.cwd(), 'public', src))

describe('home hero options (ARCHITECTURE §16.5)', () => {
  it('has content in both languages for every option but the default, with real files and an inline first frame', () => {
    for (const { id } of HERO_OPTIONS.filter((option) => option.id !== HERO_DEFAULT_OPTION)) {
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

  it('shows restaurants one pair first and the other seven of the Owner’s eight below it', () => {
    const food = heroOptionContent('food', 'zh')!
    expect(food.hero.scenes).toBeUndefined()
    expect(food.strip?.items).toHaveLength(7)
    expect(heroOptionContent('food', 'en')!.strip?.items.map((item) => item.after.src)).toEqual(food.strip?.items.map((item) => item.after.src))
  })

  it('registers every option on the hero surface', () => {
    expect(experimentRegistry[0]?.options.map((option) => option.id)).toEqual(['tote', 'art-style', 'food'])
  })
})
