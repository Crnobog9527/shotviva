import type { ReactNode } from 'react'

import { sharePath } from '@/core/analytics/share-link'
import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

import { ZoomableSample } from '../catalogue/zoomable-sample'
import type { SharedTemplate } from './load-shared-template'

export type SharedPageText = { kicker: string; hint: string; series: string }

type Props = { template: SharedTemplate; text: SharedPageText; shareId: string | null; cta: ReactNode }

// /t/<id>, a template's share page (Owner 2026-11-13): the creation dialog's left half as a page
// (the sample, opening full screen, its name, description and series) and one action, which the
// page fills per visitor (share-cta.tsx). Always noindex, never in the sitemap.
export function SharedTemplatePage({ template, text, shareId, cta }: Props) {
  return (
    <article className="mk-w grid gap-6 px-(--gutter) py-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center md:gap-10 md:py-12">
      <div className="relative">
        <ZoomableSample template={template} />
      </div>
      <div className="grid content-start gap-4">
        <p className="text-caption font-medium text-muted-foreground">{text.kicker}</p>
        <h1 className="font-display text-h1 leading-[1.05] tracking-[-0.02em]">{template.name}</h1>
        {template.description ? <p className="text-label text-pretty text-muted-foreground">{template.description}</p> : null}
        <p className="text-caption text-muted-foreground">{text.hint}</p>
        {template.series ? <SeriesLinks template={template} label={text.series} shareId={shareId} /> : null}
        <div className="grid gap-3 pt-2">{cta}</div>
      </div>
    </article>
  )
}

// The other templates of its series, each its own share page (the same share id rides along).
function SeriesLinks({ template, label, shareId }: { template: SharedTemplate; label: string; shareId: string | null }) {
  const members = template.series?.members ?? []
  return (
    <div className="grid gap-2">
      <p className="text-caption font-medium text-foreground">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {members.map((member) => (
          <li key={member.id}>
            <Link
              href={sharePath(member.id, shareId)}
              prefetch={false}
              aria-current={member.id === template.id ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-full px-4 text-caption font-medium',
                member.id === template.id ? 'bg-foreground text-background' : 'hairline bg-wash text-bone-dim hover:bg-wash-strong hover:text-foreground',
              )}
            >
              {member.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// A link whose template is not on the site (unpublished, hidden, removed, never public).
export function SharedTemplateMissing({ title, text, browse }: { title: string; text: string; browse: string }) {
  return (
    <article className="mk-w grid justify-items-center gap-4 px-(--gutter) py-20 text-center md:py-28">
      <h1 className="font-display text-h1 leading-[1.05] tracking-[-0.02em]">{title}</h1>
      <p className="max-w-[44ch] text-label text-pretty text-muted-foreground">{text}</p>
      <Link href="/" prefetch={false} className="mk-cta mt-2">
        {browse}
      </Link>
    </article>
  )
}
