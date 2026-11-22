import { readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { EN_ASSETS } from './en-assets'
import { heroMedia, INTRO_SCENES, introScenes, pickMedia } from './intro-shots'

const DIR = '/partners/graylum/'
const ALL_EN = new Set(['graylum-hero-6steps-en.webm', 'graylum-hero-6steps-en.mp4', 'graylum-hero-6steps-en-poster.webp'])

describe('which animation files a locale gets', () => {
  it('gives every locale but en the Chinese files', () => {
    for (const locale of ['zh', 'fr', ''])
      expect(pickMedia('hero-6steps', locale, ALL_EN)).toEqual({
        webm: `${DIR}graylum-hero-6steps.webm`,
        mp4: `${DIR}graylum-hero-6steps.mp4`,
        poster: `${DIR}graylum-hero-6steps-poster.webp`,
      })
  })

  it('gives en the -en files once they are listed', () => {
    expect(pickMedia('hero-6steps', 'en', ALL_EN)).toEqual({
      webm: `${DIR}graylum-hero-6steps-en.webm`,
      mp4: `${DIR}graylum-hero-6steps-en.mp4`,
      poster: `${DIR}graylum-hero-6steps-en-poster.webp`,
    })
  })

  it('falls back to the Chinese file one file at a time, and for a scene with none listed', () => {
    const partial = new Set(['graylum-hero-6steps-en-poster.webp'])
    expect(pickMedia('hero-6steps', 'en', partial)).toEqual({
      webm: `${DIR}graylum-hero-6steps.webm`,
      mp4: `${DIR}graylum-hero-6steps.mp4`,
      poster: `${DIR}graylum-hero-6steps-en-poster.webp`,
    })
    expect(pickMedia('scene-1-voiceover', 'en', partial).webm).toBe(`${DIR}graylum-scene-1-voiceover.webm`)
  })

  it('keeps the six scenes and their order whatever the locale', () => {
    expect(introScenes('en').map(scene => scene.key)).toEqual(INTRO_SCENES.map(scene => scene.key))
    expect(heroMedia('en')).toBeDefined()
  })
})

describe('the English manifest', () => {
  const onDisk = readdirSync(new URL(`../../../../../public${DIR}`, import.meta.url))
  const known = new Set(
    ['hero-6steps', 'scene-1-voiceover', 'scene-2-post', 'scene-3-storyboard', 'scene-4-repurpose', 'scene-5-image-with-shotviva', 'scene-6-more-tools'].flatMap(name => {
      const media = pickMedia(name, 'en', new Set([...onDisk, ...ALL_EN]))
      return [media.webm, media.mp4, media.poster].map(path => path.slice(DIR.length))
    }),
  )

  it('lists exactly the -en files that are in public/partners/graylum', () => {
    // Loose on purpose: any file that looks English must be listed, so a misnamed delivery fails here.
    const english = onDisk.filter(name => /(^|[-_.])en([-_.]|$)/i.test(name))
    expect([...EN_ASSETS].sort()).toEqual(english.sort())
  })

  it('only lists names a scene can actually ask for', () => {
    for (const name of EN_ASSETS) expect(known.has(name), name).toBe(true)
  })
})
