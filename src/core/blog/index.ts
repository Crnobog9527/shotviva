// The blog (ARCHITECTURE §12.6): the data rules, the public cached reads and SEO. The views are
// in ./ui, apart, so a page that only needs the reads (the footer) does not load the blog's CSS.
export {
  BLOG_CACHE_TAG,
  BLOG_PATH,
  BLOG_STATUSES,
  MAX_BODY_CHARS,
  SLUG_PATTERN,
  postInputSchema,
  postPath,
  statusInputSchema,
  type BlogStatus,
  type Post,
  type PostInput,
  type PostSummary,
} from './rules'
export { cachedPublishedPost, cachedPublishedPosts, cachedSitemapPosts, readPublishedPost, readPublishedPosts, readSitemapPosts } from './read'
export { articleLd, blogListMetadata, postCrumbs, postMetadata } from './seo'
export { blogSitemapXml } from './sitemap'
export { parseMarkdown, plainText, type Block, type TocEntry } from './markdown'
