import type { ModuleId, SiteConfig } from '../config'
import { isIndexable } from './indexing'
import { absoluteUrl } from './site-url'

// /llms.txt: main pages with a one-line summary (建站规格 G10).
export type LlmsPage = { path: string; title: string; description: string; module?: ModuleId }

export function llmsTxt(site: SiteConfig, summary: string, pages: readonly LlmsPage[]): string {
  const lines = pages
    .filter((page) => isIndexable(site, page.path, pages))
    .map((page) => `- [${page.title}](${absoluteUrl(site, page.path)}): ${page.description}`)
  return [
    `# ${site.brand.name}`,
    '',
    `> ${site.brand.tagline}. ${summary}`,
    '',
    '## Pages',
    '',
    ...lines,
    '',
  ].join('\n')
}

export function textResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
