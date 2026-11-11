import Image from 'next/image'
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
      <b>
        {card.name}
        <span className="mk-scount">{t('seriesCount', { count: card.series?.count ?? 0 })}</span>
      </b>
      <span className="mk-use">{card.use}</span>
    </span>
  )
}

type Props = { card: TemplateCard; media: TemplateLookup; sizes: string; size?: 'lg' | 'card' }

// A series card (T102, Owner 2026-11-12): static until a pointer rests on it (or, on a touch
// screen, until it is in view), then it crossfades through its members' pairs. A link: it opens
// the series in Create. Name, use and size of the set are in the HTML (建站规格 R5).
export function SeriesCard({ card, media, sizes, size = 'card' }: Props) {
  const t = useTranslations('marketing.home')
  if (!card.series) return null
  return (
    <Link href={card.series.href} className="mk-tpl mk-series" aria-label={t('seriesAria', { name: card.name, use: card.use, count: card.series.count })}>
      <SeriesPairs card={card} media={media} size={size} sizes={sizes} />
      <SeriesMeta card={card} />
    </Link>
  )
}
