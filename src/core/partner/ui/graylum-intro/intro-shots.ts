// Graylum's own screenshots (supplied by the Owner, public/partners/graylum): a thumbnail at
// twice the size it is shown at, and a large file, about 1200px on the long edge, that is only
// asked for when the lightbox opens. `key` names the shot's words in partner.intro.shots.
export type IntroShot = {
  key: ShotKey
  thumb: { src: string; width: number; height: number }
  large: { src: string; width: number; height: number }
}

export const SHOT_KEYS = ['roadmap', 'script', 'xhsPost', 'storyboard', 'storeVisit', 'shotvivaImage', 'tools'] as const
export type ShotKey = (typeof SHOT_KEYS)[number]

const BASE = '/partners/graylum'
const FILE: Record<ShotKey, string> = {
  roadmap: 'roadmap',
  script: 'script',
  xhsPost: 'xhs-post',
  storyboard: 'storyboard',
  storeVisit: 'store-visit',
  shotvivaImage: 'shotviva-image',
  tools: 'tools',
}
// Pixel sizes of the files, so every box is reserved before its picture arrives.
const LARGE: Partial<Record<ShotKey, [number, number]>> = { roadmap: [1002, 1200], script: [1063, 1200] }

function shot(key: ShotKey): IntroShot {
  const [width, height] = LARGE[key] ?? [1200, 960]
  const thumb = key === 'roadmap' ? { width: 1344, height: 840 } : { width: 640, height: 480 }
  return {
    key,
    thumb: { src: `${BASE}/${FILE[key]}-thumb.webp`, ...thumb },
    large: { src: `${BASE}/${FILE[key]}-large.webp`, width, height },
  }
}

// 能做什么 shows the first; 什么时候适合用 the other six, in this order. The lightbox steps
// through all seven.
export const INTRO_SHOTS: readonly IntroShot[] = SHOT_KEYS.map(shot)

export const GRAYLUM_ICON = { src: `${BASE}/icon.webp`, size: 96 } as const
