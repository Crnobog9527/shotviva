import Link from 'next/link'

import { AnnouncementBanner } from '@/core/announcements'
import { SiteFooter } from '@/core/content'
import { footerLinks } from '@/site/content'
import { site } from '@/site/site.config'

// Placeholder marketing shell (T6 designs it): nav + content + footer (ARCHITECTURE §1).
export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <AnnouncementBanner />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between p-4">
        <Link href="/">
          {site.brand.name} <span>{site.brand.tagline}</span>
        </Link>
        <Link href="/pricing">Pricing</Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter brand={site.brand} links={footerLinks} />
    </>
  )
}
