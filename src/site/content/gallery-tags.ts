import type { GalleryTag } from '@/core/gallery/tags'

// The tag pages' whitelist (ARCHITECTURE §9 第 4 条). Empty until the Owner approves the keywords:
// every tag needs an image or commercial intent keyword with US volume and 哥飞 KD checked, the
// top ten's page types looked at, and none of 建站规格 §5's excluded words. Start with 10–20,
// then at most 3–5 a week (创作库规格 U9, U10).
export const galleryTags: readonly GalleryTag[] = []
