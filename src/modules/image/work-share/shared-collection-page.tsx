import type { ReactNode } from 'react'

import { Link } from '@/core/i18n/ui'

import { SharedWork, type SharedWorkItem } from './shared-work'

export type SharedCollectionText = { kicker: string; title: string; note: string | null; hint: string; emptyTitle: string; emptyText: string }

// /s/w/<id>, a shared work collection (ARCHITECTURE §6.2「作品集分享」): what the sharer called it,
// their note, then the works in their order, one column on a phone and two from md, and one
// action at the end. Always noindex, never in the sitemap.
export function SharedCollectionPage({ items, text, cta }: { items: SharedWorkItem[]; text: SharedCollectionText; cta: ReactNode }) {
  return (
    <article className="mk-w grid gap-6 px-(--gutter) py-6 md:gap-8 md:py-12">
      <header className="grid max-w-[60ch] gap-3">
        <p className="text-caption font-medium text-muted-foreground">{text.kicker}</p>
        <h1 className="font-display text-h1 leading-[1.05] tracking-[-0.02em] text-balance">{text.title}</h1>
        {text.note ? <p className="text-label whitespace-pre-line text-pretty text-bone-dim">{text.note}</p> : null}
        {items.length > 0 ? <p className="text-caption text-muted-foreground">{text.hint}</p> : null}
      </header>
      {items.length > 0 ? (
        <ul className="grid gap-x-4 gap-y-8 md:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.jobId}>
              <SharedWork item={item} first={index === 0} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-2 py-10">
          <h2 className="text-headline font-semibold">{text.emptyTitle}</h2>
          <p className="text-label text-muted-foreground">{text.emptyText}</p>
        </div>
      )}
      {cta}
    </article>
  )
}

export type ShareCtaText = { title: string; text: string; action: string }

// The page's one action: a link to try Shotviva. href already carries the sharer's affiliate
// code when they have one (?ref=, read by the proxy like any referral link).
export function SharedCollectionCta({ href, text }: { href: string; text: ShareCtaText }) {
  return (
    <section className="hairline mt-2 grid gap-3 rounded-panel bg-card p-5 md:max-w-[36rem]">
      <h2 className="text-headline font-semibold">{text.title}</h2>
      <p className="text-label text-bone-dim">{text.text}</p>
      <a href={href} className="mk-cta mt-1">
        {text.action}
      </a>
    </section>
  )
}

// A link that does not open (malformed, revoked, missing, a banned owner): nothing of it shown.
export function SharedCollectionMissing({ title, text, home }: { title: string; text: string; home: string }) {
  return (
    <article className="mk-w grid justify-items-center gap-4 px-(--gutter) py-24 text-center">
      <h1 className="font-display text-h1 leading-[1.05] tracking-[-0.02em]">{title}</h1>
      <p className="text-label text-pretty text-muted-foreground">{text}</p>
      <Link href="/" prefetch={false} className="mk-cta mt-2">
        {home}
      </Link>
    </article>
  )
}
