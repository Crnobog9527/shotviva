import { freeImagesLabel, pricedProducts, type SiteConfig } from '../config'
import type { FaqItem } from '../content/page-content'
import { absoluteUrl, siteOrigin } from './site-url'

// Schema.org builders (建站规格 R7). All numbers come from the site config (G3).
type JsonLd = Record<string, unknown>

function offers(site: SiteConfig): JsonLd[] {
  const currency = site.billing.currency.toUpperCase()
  const free = {
    '@type': 'Offer',
    name: 'Free',
    description: freeImagesLabel(site),
    price: '0',
    priceCurrency: currency,
  }
  // Undecided prices are left out rather than published as 0.
  const paid = pricedProducts(site).map((product) => ({
    '@type': 'Offer',
    name: product.id,
    description: `${product.credits} images`,
    price: product.priceUsd.toFixed(2),
    priceCurrency: currency,
  }))
  return [free, ...paid]
}

export function softwareApplicationLd(
  site: SiteConfig,
  page: { path: string; title: string; description: string },
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: site.brand.name,
    url: absoluteUrl(site, page.path),
    description: page.description,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    brand: { '@type': 'Brand', name: site.brand.name },
    offers: offers(site),
  }
}

export function organizationLd(site: SiteConfig): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.brand.name,
    url: `${siteOrigin(site)}/`,
    logo: absoluteUrl(site, site.brand.logoPath),
    email: site.brand.contactEmail,
    sameAs: [...site.brand.sameAs],
  }
}

export function faqPageLd(faq: readonly FaqItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export type Crumb = { name: string; path: string }

export function breadcrumbListLd(site: SiteConfig, crumbs: readonly Crumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(site, crumb.path),
    })),
  }
}

// Escapes "<" so content can never close the script tag (Next.js JSON-LD guide).
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
