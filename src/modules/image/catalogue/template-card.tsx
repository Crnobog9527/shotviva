'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { FavoriteButton } from '../favorites/favorite-button'
import { LoopPlate } from './card-media'
import { cardPrice, hasStills, isCompareCategory, isMotion, type CatalogueTemplate } from './catalogue-template'
import { CompareSlider } from './compare-slider'
import { COVER_SIZES } from './cover-sizes'
import { PairMedia } from './pair-media'
import { useHoverWipe } from './use-hover-wipe'

// Cover widths when the card is drawn narrower than the grid's (Create's All sections).
export type CardSizes = { plate?: string; frame?: string; art?: string }

type Props = { template: CatalogueTemplate; onOpen(id: string): void; eager?: boolean; sizes?: CardSizes }

// A template card (DESIGN §4.2 and §6.9 items 1–3, B comp create.html). A 'compare' category
// (画风) keeps the drag compare; every other template is the side-by-side pair that plays its change on hover.
// A tap opens the creation dialog straight away: there is no preview step any more. The save
// heart (T83) sits over the photo's top-right corner, beside the card's button, not inside it.
export function TemplateCard(props: Props) {
  const { template } = props
  if (isCompareCategory(template) && hasStills(template)) return <ArtCard {...props} />
  return <PairCard {...props} />
}

function PairCard({ template, onOpen, eager, sizes }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const alt = useTranslations('app.template')('cardAlt', { name: template.name })
  useHoverWipe(ref)
  const { before, after, type, motion } = template.cover
  return (
    <div className="relative transition-transform duration-250 ease-house hover:-translate-y-0.5">
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(template.id)}
        className="group block w-full rounded-tile text-left transition-transform duration-250 ease-house active:scale-[.97]"
      >
        {before && after ? (
          <PairMedia before={before} after={after} alt={alt} eager={eager} sizes={sizes?.plate ?? COVER_SIZES.cardPlate} video={type === 'video' && motion ? motion : undefined} className="transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--input)]" />
        ) : isMotion(template) ? (
          <LoopPlate template={template} alt={alt} sizes={sizes?.frame ?? COVER_SIZES.cardFrame} />
        ) : (
          <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
        )}
        <CardMeta template={template} />
      </button>
      <FavoriteButton template={template} surface="create_card" className="top-0.5 right-0.5" />
    </div>
  )
}

// The one card with the drag compare (画风 / Art Styles): a tap on the photo opens the dialog, a drag
// compares; the name and price below are their own button for the keyboard. From md up it is the
// tall card spanning two rows (the grid sets the span).
function ArtCard({ template, onOpen, eager, sizes }: Props) {
  const t = useTranslations('app.template')
  return (
    <div className="relative flex h-full flex-col rounded-tile">
      <FavoriteButton template={template} surface="create_card" className="top-0.5 right-0.5" />
      <CompareSlider
        before={template.cover.before as string}
        after={template.cover.after as string}
        afterAlt={t('resultAlt', { name: template.name })}
        onTap={() => onOpen(template.id)}
        tagsAt="bottom"
        cover={{ sizes: sizes?.art ?? COVER_SIZES.artCard, lazy: !eager }}
        className="hairline rounded-control md:aspect-auto md:min-h-[280px] md:flex-1"
      />
      <button type="button" aria-haspopup="dialog" onClick={() => onOpen(template.id)} className="press block w-full rounded-inner text-left">
        <CardMeta template={template} />
      </button>
    </div>
  )
}

function CardMeta({ template }: { template: CatalogueTemplate }) {
  const t = useTranslations('app.template')
  const category = template.categoryName
  const cost = cardPrice(template)
  const kind = isMotion(template) ? t(template.cover.type === 'video' ? 'featureMeta' : 'animatedMeta', { category }) : category
  return (
    <span className="block pt-2">
      <span className="block text-body leading-[1.25] font-semibold tracking-[-0.015em]">{template.name}</span>
      <span className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{kind}</span>
      {cost !== null ? <span className="mt-2 inline-block rounded-tag bg-wash px-2 py-1 font-mono text-caption leading-none text-bone-dim">{t('fromCredits', { count: cost })}</span> : null}
    </span>
  )
}
