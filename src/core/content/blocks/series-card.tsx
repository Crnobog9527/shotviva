import { SiteImage as Image } from '@/core/ui/site-image'
import { useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { WhiteGroundImage } from '../../ui/white-ground-image'
import type { TemplateCard } from '../page-content'
import { CoverFill } from './cover-fill'
import { BUNDLE_FIRST_ATTR, MORE_ATTR, SIZES_ATTR } from './series-layers'
import type { TemplateLookup } from './template-grid'

const SIZE = { width: 900, height: 1125 }
type Pair = { id: string; before: string; after: string }

// The pictured members' covers, in series (or bundle) order.
function pairsOf(card: TemplateCard, media: TemplateLookup): Pair[] {
  return (card.series?.members ?? card.bundle?.members ?? []).flatMap((id) => {
    const cover = media[id]
    return cover?.before && cover.after ? [{ id, before: cover.before, after: cover.after }] : []
  })
}

type PairsProps = { card: TemplateCard; media: TemplateLookup; size: 'lg' | 'card'; sizes: string }

// The series' frame: the same phone | AI pair as a template card, its first member drawn by the
// server; the others' covers become layers above it in the browser when the card first plays,
// their addresses fetched then under the card's key (series-layers.ts). With one pair (or none)
// it is a still card.
export function SeriesPairs({ card, media, size, sizes }: PairsProps) {
  const t = useTranslations('marketing.home')
  const [first, ...rest] = pairsOf(card, media)
  if (!first) {
    return (
      <span className="mk-pair mk-pair-blank" aria-hidden>
        <span className="mk-pane" />
        <span className="mk-pane" />
        <span className="mk-hl" />
      </span>
    )
  }
  return (
    <span
      className={cn('mk-pair mk-spair', size === 'lg' && 'mk-pair-lg')}
      {...(rest.length > 0 ? { [MORE_ATTR]: card.id, [SIZES_ATTR]: sizes } : {})}
    >
      <span className="mk-pane">
        <CoverFill />
        <Image className="mk-sb" src={first.before} alt="" {...SIZE} sizes={sizes} loading="lazy" />
      </span>
      <span className="mk-pane">
        <CoverFill />
        <WhiteGroundImage className="mk-sa" src={first.after} alt="" {...SIZE} sizes={sizes} loading="lazy" fitPlate />
      </span>
      <span className="mk-hl" aria-hidden />
      <span className="mk-tag mk-tag-l" aria-hidden>
        {t('phone')}
      </span>
      <span className="mk-tag mk-tag-r" aria-hidden>
        {t('ai')}
      </span>
    </span>
  )
}

function SeriesMeta({ card }: { card: TemplateCard }) {
  const t = useTranslations('marketing.home')
  return (
    <span className="mk-tpl-meta">
      <b>{card.name}</b>
      <span className="mk-use">{card.use}</span>
      <span className="mk-scount">{t('seriesCount', { count: card.series?.count ?? 0 })}</span>
    </span>
  )
}

// 「系列」 / "Series" on the picture's top left, the same pill as Create's series cards
// (modules/image/catalogue/series-badge.tsx, #512): a stack-of-prints glyph and the word on the
// Phone tag's frosted ground. Copied, not imported: core cannot import modules.
function SeriesBadge() {
  const t = useTranslations('marketing.home')
  return (
    <span className="mk-sbadge" aria-hidden>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
        <rect x="2" y="5.5" width="9" height="8" rx="1.5" />
        <path d="M5 3.5h7.5A1.5 1.5 0 0 1 14 5v6.5" strokeLinecap="round" />
      </svg>
      {t('seriesBadge')}
    </span>
  )
}

type Props = { card: TemplateCard; media: TemplateLookup; sizes: string; size?: 'lg' | 'card' }

// What a series card (or its "Open" pill) asks the template panel for: its first pictured member
// and the series by slug. A card with no pictured member names no template.
export function seriesPick(series: NonNullable<TemplateCard['series']>): Record<string, string> {
  const first = series.members[0]
  return first ? { 'data-pick-template': first, [BUNDLE_FIRST_ATTR]: first, 'data-pick-set': `series:${series.slug}` } : {}
}

// A series card (T102, Owner 2026-11-12): static until a pointer rests on it (or, on a touch
// screen, until it is in view), then it crossfades through its members' pairs. On a page with
// the template panel (home, landing pages; Owner 2026-11-25) a click opens it on the member on
// show (data-pick-template, kept current by the crossfade as on a bundle card) with the series to
// switch between (data-pick-set); elsewhere data-open-series still goes to the series in Create. A 「系列」 badge and
// stacked prints tell it from a single template at a glance. A button, not a link: it opens the
// series in Create (series-motion-mount.tsx moves there on the click), and Create needs a session
// and is noindex, so a crawlable <a> to it only spent this page's link equity on the sign-in
// redirect (SEO 2026-11-14). Name, use and size of the set are in the HTML (建站规格 R5).
export function SeriesCard({ card, media, sizes, size = 'card' }: Props) {
  if (!card.series) return null
  return (
    <button type="button" data-open-series={card.series.href} className="mk-tpl mk-series" {...seriesPick(card.series)}>
      {/* Two prints stacked behind the frame, their corners showing past it (as in Create). */}
      <span className={size === 'lg' ? 'mk-sstack mk-sstack-lg' : 'mk-sstack'} aria-hidden>
        <span className="mk-sprint mk-sprint-back" aria-hidden />
        <span className="mk-sprint mk-sprint-mid" aria-hidden />
        <span className="mk-sframe">
          <SeriesPairs card={card} media={media} size={size} sizes={sizes} />
          <SeriesBadge />
        </span>
      </span>
      {size === 'lg' ? <span className="sr-only">{card.name}</span> : <SeriesMeta card={card} />}
    </button>
  )
}
