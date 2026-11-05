import Link from 'next/link'

import { site } from '@/site/site.config'

// Placeholder marketing shell (T6 designs it): nav + content + footer (ARCHITECTURE §1).
function SiteFooter() {
  const { brand } = site
  return (
    <footer className="mx-auto w-full max-w-3xl p-4 text-sm">
      <p>
        {brand.name} — {brand.tagline}. {brand.domain} is the only official {brand.name} site.
      </p>
      <p>
        Launched {brand.launchYear}. Serving {brand.countries.join(', ')}. Contact:{' '}
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
      </p>
    </footer>
  )
}

export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between p-4">
        <Link href="/">
          {site.brand.name} <span>{site.brand.tagline}</span>
        </Link>
        <Link href="/pricing">Pricing</Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </>
  )
}
