import { SiteImage as Image } from '@/core/ui/site-image'
import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import { cn } from '../../ui/cn'
import { WhiteGroundImage } from '../../ui/white-ground-image'
import type { TemplateCard } from '../page-content'
import type { TemplateLookup } from './template-grid'

const SIZE = { width: 900, height: 1125 }
type Pair = { id: string; before: string; after: string }

// The pictured members' covers, in series order.
function pairsOf(card: TemplateCard, media: TemplateLookup): Pair[] {
  return (card.series?.members ?? []).flatMap((id) => {
    const cover = media[id]
    return cover?.before && cover.after ? [{ id, before: cover.before, after: cover.after }] : []
  })
}

// One extra pair, stacked over the first. Hidden (display: none) until the card is armed by
// series-motion.tsx, so its lazy images are not fetched before a visitor hovers or scrolls to it.
function Layer({ pair, sizes }: { pair: Pair; sizes: string }) {
  return (
    <span className="mk-sl" aria-hidden>
      <span className="mk-pane">
        <Image className="mk-sb" src={pair.before} alt="" {...SIZE} sizes={sizes} loading="lazy" />
      </span>
      <span className="mk-pane">
        <WhiteGroundImage className="mk-sa" src={pair.after} alt="" {...SIZE} sizes={sizes} loading="lazy" />
      </span>
    </span>
  )
}

type PairsProps = { card: TemplateCard; media: TemplateLookup; size: 'lg' | 'card'; sizes: string }

// The series' frame: the same phone | AI pair as a template card, its first member drawn by the
// server, the others layered above it. With one pair (or none) it is a still card.
function SeriesPairs({ card, media, size, sizes }: PairsProps) {
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
    <span className={cn('mk-pair mk-spair', size === 'lg' && 'mk-pair-lg')} data-series-pairs={rest.length > 0 ? '' : undefined}>
      <span className="mk-pane">
        <Image className="mk-sb" src={first.before} alt={t('beforeAlt', { name: card.name })} {...SIZE} sizes={sizes} loading="lazy" />
      </span>
      <span className="mk-pane">
        <WhiteGroundImage className="mk-sa" src={first.after} alt={t('afterAlt', { name: card.name, use: card.use })} {...SIZE} sizes={sizes} loading="lazy" />
      </span>
      {rest.map((pair) => (
        <Layer key={pair.id} pair={pair} sizes={sizes} />
      ))}
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

// A series card (T102, Owner 2026-11-12): static until a pointer rests on it (or, on a touch
// screen, until it is in view), then it crossfades through its members' pairs. A 「系列」 badge and
// stacked prints tell it from a single template at a glance. A link: it opens the series in
// Create. Name, use and size of the set are in the HTML (建站规格 R5).
export function SeriesCard({ card, media, sizes, size = 'card' }: Props) {
  const t = useTranslations('marketing.home')
  if (!card.series) return null
  return (
    // No prefetch: Create needs a session, and a marketing page should not fetch it for every visitor.
    <Link href={card.series.href} prefetch={false} className="mk-tpl mk-series" aria-label={t('seriesAria', { name: card.name, use: card.use, count: card.series.count })}>
      {/* Two prints stacked behind the frame, their corners showing past it (as in Create). */}
      <span className={size === 'lg' ? 'mk-sstack mk-sstack-lg' : 'mk-sstack'}>
        <span className="mk-sprint mk-sprint-back" aria-hidden />
        <span className="mk-sprint mk-sprint-mid" aria-hidden />
        <span className="mk-sframe">
          <SeriesPairs card={card} media={media} size={size} sizes={sizes} />
          <SeriesBadge />
        </span>
      </span>
      <SeriesMeta card={card} />
    </Link>
  )
}
