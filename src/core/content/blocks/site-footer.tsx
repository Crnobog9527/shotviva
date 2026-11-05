import Link from 'next/link'

import { formatAddress, type SiteBrand } from '../../config'

export type FooterLink = { href: `/${string}`; label: string }

// Every marketing page carries the official-site statement and who runs the site, with
// contact details (建站规格 G8, LAUNCH §8). All facts come from the site config.
export function SiteFooter({ brand, links }: { brand: SiteBrand; links: readonly FooterLink[] }) {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground">
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          {brand.name} — {brand.tagline}. {brand.domain} is the only official {brand.name} site.
        </p>
        <p>
          {brand.name} is operated by {brand.legalName}, {formatAddress(brand.address)}.
        </p>
        <p>
          Launched {brand.launchYear}. Serving {brand.countries.join(', ')}. Contact:{' '}
          <a href={`mailto:${brand.contactEmail}`} className="underline underline-offset-4 hover:text-foreground">
            {brand.contactEmail}
          </a>
        </p>
        <p>
          © {brand.launchYear} {brand.legalName}
        </p>
      </div>
    </footer>
  )
}
