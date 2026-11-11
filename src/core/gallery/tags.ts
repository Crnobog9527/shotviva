// Tag pages (ARCHITECTURE §9 第 4 条, 创作库规格 U6–U8): one page per vetted keyword, and only
// for keywords in the site's whitelist. A tag lists approved works of its templates. The page
// carries the five parts U7 asks for: the direct answer, the body, the grid, the way to make one,
// and the related tags. English only for now (the zh keyword map has no tags).
export type GalleryTag = {
  slug: string
  // The keyword the page ranks for (US volume and 哥飞 KD checked and approved first).
  keyword: string
  title: string
  description: string
  h1: string
  // 40–60 words, starting with the keyword (U7 第 1 条).
  answer: string
  // 150–300 words in a few paragraphs (U7 第 2 条).
  body: readonly string[]
  templateIds: readonly string[]
  // Where 「make one」 goes: a template of this tag.
  ctaTemplateId: string
  ctaLabel: string
  related: readonly string[]
}

export function findTag(tags: readonly GalleryTag[], slug: string): GalleryTag | null {
  return tags.find((tag) => tag.slug === slug) ?? null
}

// Related tags that exist; a slug that is not (yet) a page is dropped, never linked.
export function relatedTags(tags: readonly GalleryTag[], tag: GalleryTag): GalleryTag[] {
  return tag.related.flatMap((slug) => tags.filter((other) => other.slug === slug && other.slug !== tag.slug))
}
