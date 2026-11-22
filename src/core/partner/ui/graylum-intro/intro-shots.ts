import { EN_ASSETS } from './en-assets'

// Graylum's own looping explainer animations (supplied by the Owner, public/partners/graylum).
// Every one is 16:10, 1280×800, silent, in WebM and MP4 with a WebP poster. `key` names the
// scene's words in partner.intro.shots. The hero shows the six steps; the six scenes show in a
// grid by poster and only play in the enlarged view.
export type IntroMedia = { webm: string; mp4: string; poster: string }
export type IntroScene = { key: SceneKey; media: IntroMedia }

export const SCENE_KEYS = ['voiceover', 'post', 'storyboard', 'repurpose', 'imageWithShotviva', 'moreTools'] as const
export type SceneKey = (typeof SCENE_KEYS)[number]

export const MEDIA_SIZE = { width: 1280, height: 800 } as const

const BASE = '/partners/graylum'
const FILE: Record<SceneKey, string> = {
  voiceover: 'scene-1-voiceover',
  post: 'scene-2-post',
  storyboard: 'scene-3-storyboard',
  repurpose: 'scene-4-repurpose',
  imageWithShotviva: 'scene-5-image-with-shotviva',
  moreTools: 'scene-6-more-tools',
}

const ZH_FILES = (name: string): IntroMedia => ({
  webm: `graylum-${name}.webm`,
  mp4: `graylum-${name}.mp4`,
  poster: `graylum-${name}-poster.webp`,
})
const EN_FILES = (name: string): IntroMedia => ZH_FILES(`${name}-en`)

// One scene's files for a locale: `en` takes the -en file where EN_ASSETS lists it, file by
// file (webm, mp4 and poster each fall back to the Chinese one on their own); every other
// locale takes the Chinese files.
export function pickMedia(name: string, locale: string, available: ReadonlySet<string> = EN_ASSETS): IntroMedia {
  const zh = ZH_FILES(name)
  const en = EN_FILES(name)
  const file = (kind: keyof IntroMedia) => `${BASE}/${locale === 'en' && available.has(en[kind]) ? en[kind] : zh[kind]}`
  return { webm: file('webm'), mp4: file('mp4'), poster: file('poster') }
}

export const heroMedia = (locale: string, available?: ReadonlySet<string>) => pickMedia('hero-6steps', locale, available)

// 什么时候适合用, in this order. The enlarged view steps through all six.
export const introScenes = (locale: string, available?: ReadonlySet<string>): readonly IntroScene[] =>
  SCENE_KEYS.map(key => ({ key, media: pickMedia(FILE[key], locale, available) }))

// The Chinese set: the keys and the count do not depend on the locale.
export const INTRO_SCENES = introScenes('zh')

export const GRAYLUM_ICON = { src: `${BASE}/icon.webp`, size: 96 } as const
