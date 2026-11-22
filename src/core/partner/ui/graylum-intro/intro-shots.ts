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

const media = (name: string): IntroMedia => ({
  webm: `${BASE}/graylum-${name}.webm`,
  mp4: `${BASE}/graylum-${name}.mp4`,
  poster: `${BASE}/graylum-${name}-poster.webp`,
})

export const HERO_MEDIA = media('hero-6steps')

// 什么时候适合用, in this order. The enlarged view steps through all six.
export const INTRO_SCENES: readonly IntroScene[] = SCENE_KEYS.map(key => ({ key, media: media(FILE[key]) }))

export const GRAYLUM_ICON = { src: `${BASE}/icon.webp`, size: 96 } as const
