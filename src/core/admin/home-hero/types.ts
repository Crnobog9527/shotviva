import type { HeroSceneEntry, HeroScope } from '@/core/templates/home-hero'

import type { ActionResult } from '../templates/types'

// 首页首屏大图 (migration 2007): one scope's whole list, in order. Empty: a language follows the
// default again; the default goes back to the built-in hero.
export type SaveHomeHeroInput = { scope: HeroScope; entries: HeroSceneEntry[] }

export type HomeHeroActions = {
  save: (input: SaveHomeHeroInput) => Promise<ActionResult>
}
