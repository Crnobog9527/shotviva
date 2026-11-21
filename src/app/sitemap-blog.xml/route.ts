import { blogSitemapXml, cachedSitemapPosts } from '@/core/blog'
import { closedSeoFileResponse, xmlResponse } from '@/core/seo'
import { BLOG_AUTHORS } from '@/site/content/blog-authors'
import { site } from '@/site/site.config'

// The blog's child sitemap (建站规格 R6): every published post with the day it last changed, and
// each registered author's page where they have a post.
// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0), like every other sitemap;
// it carries the read's blog tag, so a publish or take-down shows in it at once.
export async function GET() {
  return (await closedSeoFileResponse()) ?? xmlResponse(blogSitemapXml(site, await cachedSitemapPosts(), BLOG_AUTHORS))
}
