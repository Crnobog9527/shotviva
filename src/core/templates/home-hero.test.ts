import { describe, expect, it } from 'vitest'

import { HERO_SCOPES, heroScenesFor, isHeroScope, toHomeHeroSettings } from './home-hero'
import { LOCALES } from '../i18n/locales'

const row = (scope: string, position: number, template_id: string, caption: string | null = null) => ({ scope, position, template_id, caption })

describe('首页首屏大图 settings', () => {
  it('offers the default and every site language, from the code\'s language list', () => {
    expect(HERO_SCOPES).toEqual(['default', ...LOCALES])
    expect(isHeroScope('default')).toBe(true)
    expect(isHeroScope('xx')).toBe(false)
  })

  it('groups rows by scope in position order and leaves out a language the site no longer has', () => {
    expect(toHomeHeroSettings([row('zh', 2, 'b'), row('default', 1, 'd', 'Same plate'), row('zh', 1, 'a'), row('fr', 1, 'f')])).toEqual({
      default: [{ templateId: 'd', caption: 'Same plate' }],
      zh: [{ templateId: 'a', caption: null }, { templateId: 'b', caption: null }],
    })
  })

  it('shows a language its own scenes, else the default ones, else none', () => {
    const settings = toHomeHeroSettings([row('default', 1, 'd'), row('zh', 1, 'z')])
    expect(heroScenesFor(settings, 'zh').map((scene) => scene.templateId)).toEqual(['z'])
    expect(heroScenesFor(settings, 'en').map((scene) => scene.templateId)).toEqual(['d'])
    expect(heroScenesFor({}, 'en')).toEqual([])
  })
})
