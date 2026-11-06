import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { LegalBlock, LegalLink, LegalPage } from '@/core/content'
import { NOINDEX, pageMetadata, pageSitemapUrls } from '@/core/seo'

import { site } from '../../site.config'
import { pageGates } from '../index'
import { footerLinks, legalPages, termsPage } from './index'

const PATHS = ['/terms', '/privacy', '/refund-policy', '/acceptable-use']

function blockLinks(block: LegalBlock): LegalLink[] {
  if (typeof block === 'string') return []
  if (Array.isArray(block)) return block.filter((part): part is LegalLink => typeof part !== 'string')
  if ('list' in block) return block.list.flatMap((item) => blockLinks(item))
  return []
}

function pageLinks(page: LegalPage): LegalLink[] {
  return [...page.intro, ...page.sections.flatMap((s) => s.blocks)].flatMap(blockLinks)
}

describe('legal pages (T19)', () => {
  it('has the four pages, all linked from the footer, then Contact (T27)', () => {
    expect(legalPages.map((p) => p.path)).toEqual(PATHS)
    expect(footerLinks.map((l) => l.href)).toEqual([...PATHS, '/account/help'])
    expect(footerLinks.at(-1)?.label).toBe('Contact')
  })

  it.each(PATHS)('%s is noindex through the global switch and stays out of the sitemap', (path) => {
    const page = legalPages.find((p) => p.path === path)!
    expect(site.indexing.indexablePaths).not.toContain(path)
    expect(pageMetadata(site, page).robots).toEqual(NOINDEX)
    expect(pageSitemapUrls(site, pageGates).some((url) => url.endsWith(path))).toBe(false)
  })

  it('uses unique section anchors on every page', () => {
    for (const page of legalPages) {
      const ids = page.sections.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('links only to pages that exist, files in public/, our own email or https', () => {
    // '/account/help' is Help & feedback (T27), where the refund policy sends signed-in users.
    // The MiSans licence ships in public/fonts/misans/ (Third-party notices on the Terms page).
    const known = new Set([...PATHS, '/pricing', '/account/help', '/fonts/misans/LICENSE.pdf'])
    for (const link of legalPages.flatMap(pageLinks)) {
      if (link.href.startsWith('/')) expect(known).toContain(link.href)
      else if (link.href.startsWith('mailto:')) expect(link.href).toBe(`mailto:${site.brand.contactEmail}`)
      else expect(link.href).toMatch(/^https:\/\//)
    }
  })

  it('ends every page with the entity contact details from site.config', () => {
    for (const page of legalPages) {
      const contact = page.sections.at(-1)!
      expect(contact.id).toBe('contact')
      const text = JSON.stringify(contact.blocks)
      expect(text).toContain(site.brand.legalName)
      expect(text).toContain(site.brand.address.street)
      expect(text).toContain(site.brand.contactEmail)
    }
  })

  // Owner 2026-11-05: free-credit display, likeness and IP responsibility must stand out.
  it('gives the free-work, likeness and IP rules their own Terms section, cited by Indemnity', () => {
    const section = (id: string) => JSON.stringify(termsPage.sections.find((s) => s.id === id)?.blocks)
    const responsibility = section('responsibility')
    expect(responsibility).toContain('This photo uses free credits')
    expect(responsibility).toMatch(/parent or legal guardian/)
    expect(responsibility).toMatch(/copyright, trademark or other intellectual property/)
    expect(section('indemnity')).toContain('Free works, likeness and your responsibility')
  })

  // Pages read the entity from config; a literal would go stale when a site swaps site/.
  it('never hard-codes entity facts or Graylum contact details in the text files', () => {
    const dir = join(process.cwd(), 'src', 'site', 'content', 'legal')
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    const { brand } = site
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
      for (const literal of [brand.legalName, brand.contactEmail, brand.address.street, 'graylum.com']) {
        expect(source, `${file} contains "${literal}"`).not.toContain(literal)
      }
    }
  })
})

describe('MiSans attribution (ARCHITECTURE §17, DESIGN §6.9)', () => {
  it('sits in the Terms page under Third-party notices and links the licence', () => {
    const notices = termsPage.sections.find((section) => section.id === 'third-party-notices')
    expect(notices?.heading).toBe('Third-party notices')
    const text = JSON.stringify(notices?.blocks)
    expect(text).toContain('This site uses the MiSans font, © Xiaomi.')
    expect(notices?.blocks.flatMap(blockLinks).map((link) => link.href)).toContain('/fonts/misans/LICENSE.pdf')
  })
})
