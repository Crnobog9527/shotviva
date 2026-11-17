import type { HeroBlock, HeroStripBlock, ImageRef } from '@/core/content'
import type { Locale } from '@/core/i18n/locales'

import { withFirstFrame } from '../content/landing-shared'
import { food } from './hero-food'

export { HERO_DEFAULT_OPTION, HERO_OPTIONS } from './registry'

// The home hero's options for A/B experiments (ARCHITECTURE §16.5, Owner 2026-11-14). Each is a
// real before/after set made with a published template, plus one short line; the H1, subtitle and
// direct answer never change (建站规格 §4, G1), so search engines and every group read the same
// page copy. `tote` is today's hero (the e-commerce case) and needs nothing here.
// Not here yet: food (the Owner picks the pictures first) and hotels (no template exists).

export type HeroOptionContent = {
  hero: Pick<HeroBlock, 'before' | 'after' | 'caption' | 'scenes'>
  // One line under the direct answer that says who this demo is for.
  tagline: string
  // More real pairs in a row under the first screen (lazy, small).
  strip?: HeroStripBlock
}

// All 912 × 1140 (4:5), public/home; one phone photo, three art-style templates (flat-anime-style,
// animated-3d-style, watercolor-storybook), their real covers.
const art = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 912, height: 1140 })

const artStyle: Record<Locale, HeroOptionContent> = {
  en: {
    hero: {
      before: withFirstFrame(art('hero-art-photo', 'Phone photo: a tabby cat with white paws lying on a grey sofa arm, a lamp and bookshelf behind')),
      after: art('hero-art-anime', 'Real example: the same tabby cat on the sofa arm, redrawn in a flat anime style'),
      caption: 'Same cat, flat anime style',
      scenes: {
        label: 'Art styles of the same photo',
        items: [
          { image: art('hero-art-anime', 'Real example: the same tabby cat on the sofa arm, redrawn in a flat anime style'), caption: 'Same cat, flat anime style' },
          { image: art('hero-art-3d', 'Real example: the same tabby cat as a 3D animated character, lamp light on its fur'), caption: 'Same cat, 3D animation style' },
          { image: art('hero-art-watercolor', 'Real example: the same tabby cat painted as a watercolor storybook page'), caption: 'Same cat, watercolor storybook' },
        ],
      },
    },
    tagline: 'Turn a photo of your pet, your kids or your friends into anime, 3D or watercolor art. The face and pose stay theirs.',
  },
  zh: {
    hero: {
      before: withFirstFrame(art('hero-art-photo', '手机照片：一只白爪子的虎斑猫趴在灰色沙发扶手上，身后是台灯和书架')),
      after: art('hero-art-anime', '真实案例：同一只虎斑猫趴在沙发扶手上，变成平涂动漫风'),
      caption: '同一只猫，变成动漫风',
      scenes: {
        label: '同一张照片做出的画风',
        items: [
          { image: art('hero-art-anime', '真实案例：同一只虎斑猫趴在沙发扶手上，变成平涂动漫风'), caption: '同一只猫，变成动漫风' },
          { image: art('hero-art-3d', '真实案例：同一只虎斑猫变成 3D 动画角色，毛发上有台灯的暖光'), caption: '同一只猫，变成 3D 动画' },
          { image: art('hero-art-watercolor', '真实案例：同一只虎斑猫画成水彩绘本的一页'), caption: '同一只猫，变成水彩绘本' },
        ],
      },
    },
    tagline: '把宠物、孩子或朋友的照片变成动漫、3D 或水彩画，长相和姿势还是原来的样子。',
  },
}

const CONTENT: Readonly<Record<string, Record<Locale, HeroOptionContent>>> = { 'art-style': artStyle, food }

// null for the default option (the page's own hero) and for an option the code does not have.
export function heroOptionContent(option: string, locale: Locale): HeroOptionContent | null {
  return CONTENT[option]?.[locale] ?? null
}
