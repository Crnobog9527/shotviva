import type { ModuleId, SiteConfig } from '../config'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { isIndexableIn } from './indexing'
import { absoluteUrl } from './site-url'

// /llms.txt: main pages with a one-line summary (建站规格 G10).
// `path` is the logical path; `locale` (default English) picks the address ("/" in zh is /zh).
export type LlmsPage = { path: string; title: string; description: string; module?: ModuleId; locale?: Locale }

export function llmsTxt(site: SiteConfig, summary: string, pages: readonly LlmsPage[]): string {
  const lines = pages
    .filter((page) => isIndexableIn(site, page.locale ?? DEFAULT_LOCALE, page.path, pages))
    .map((page) => `- [${page.title}](${absoluteUrl(site, localizePath(page.path, page.locale ?? DEFAULT_LOCALE))}): ${page.description}`)
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
