import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { heroMedia, INTRO_SCENES, introScenes } from './intro-shots'

const HERO_MEDIA = heroMedia('zh')
import { canStep, DRAG_TO_CLOSE, lightboxReducer, pulledDown } from './lightbox-state'

const reduce = lightboxReducer(INTRO_SCENES.length)

describe('the scene lightbox', () => {
  it('opens on the scene that was pressed', () => {
    expect(reduce(null, { type: 'open', index: 3 })).toEqual({ index: 3 })
    expect(reduce(null, { type: 'open', index: 6 })).toBeNull()
  })

  it('steps left and right and stops at both ends', () => {
    let state = reduce(null, { type: 'open', index: 0 })
    expect(canStep(state, -1, 6)).toBe(false)
    expect(reduce(state, { type: 'step', by: -1 })).toEqual({ index: 0 })
    state = reduce(state, { type: 'step', by: 1 })
    expect(state).toEqual({ index: 1 })
    state = reduce({ index: 5 }, { type: 'step', by: 1 })
    expect(state).toEqual({ index: 5 })
    expect(canStep(state, 1, 6)).toBe(false)
    expect(canStep(state, -1, 6)).toBe(true)
  })

  it('closes from any scene, and a closed lightbox does not step', () => {
    expect(reduce({ index: 4 }, { type: 'close' })).toBeNull()
    expect(reduce(null, { type: 'step', by: 1 })).toBeNull()
  })

  it('counts only a mostly downward drag as pulling the sheet', () => {
    expect(pulledDown(4, 120)).toBe(120)
    expect(pulledDown(100, 120)).toBe(0)
    expect(pulledDown(0, -50)).toBe(0)
    expect(pulledDown(0, 10)).toBe(0)
    expect(DRAG_TO_CLOSE).toBeGreaterThan(12)
  })

  it('keeps six scenes in order, each with a webm, an mp4 and a poster', () => {
    expect(INTRO_SCENES.map(scene => scene.key)).toEqual(['voiceover', 'post', 'storyboard', 'repurpose', 'imageWithShotviva', 'moreTools'])
    for (const { media } of [{ media: HERO_MEDIA }, ...INTRO_SCENES]) {
      expect(media.webm).toMatch(/^\/partners\/graylum\/graylum-.+\.webm$/)
      expect(media.mp4).toMatch(/\.mp4$/)
      expect(media.poster).toMatch(/-poster\.webp$/)
    }
  })
})

// The real files in public/: present, a lossy WebP poster at 1280×800 (16:10) under 60 KB, and
// each video under 1 MB (about 4.5 MB for the 21 Chinese files, 4.3 MB for the 21 English ones).
describe('the animation files', () => {
  it('exist at the size the dialog reserves and stay within budget', () => {
    const all = ['zh', 'en'].flatMap(locale => [heroMedia(locale), ...introScenes(locale).map(scene => scene.media)])
    for (const media of all) {
      const poster = readFileSync(new URL(`../../../../../public${media.poster}`, import.meta.url))
      expect(poster.toString('ascii', 12, 16)).toBe('VP8 ')
      expect([poster.readUInt16LE(26) & 0x3fff, poster.readUInt16LE(28) & 0x3fff]).toEqual([1280, 800])
      expect(poster.length).toBeLessThanOrEqual(60 * 1024)
      for (const src of [media.webm, media.mp4]) {
        const bytes = readFileSync(new URL(`../../../../../public${src}`, import.meta.url)).length
        expect(bytes).toBeGreaterThan(0)
        expect(bytes).toBeLessThanOrEqual(1024 * 1024)
      }
    }
  })
})
