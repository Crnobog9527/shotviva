'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { LoopPlate } from './card-media'
import { cardPrice, hasStills, isArtStyle, isMotion, type CatalogueTemplate } from './catalogue-template'
import { useCategoryLabel } from './category-label'
import { CompareSlider } from './compare-slider'
import { PairMedia } from './pair-media'
import { useHoverWipe } from './use-hover-wipe'

type Props = { template: CatalogueTemplate; onOpen(id: string): void; eager?: boolean }

// A template card (DESIGN §4.2 and §6.9 items 1–3, B comp create.html). Art Styles keeps the
// drag compare; every other template is the side-by-side pair that plays its change on hover.
// A tap opens the creation dialog straight away: there is no preview step any more.
export function TemplateCard(props: Props) {
  const { template } = props
  if (isArtStyle(template) && hasStills(template)) return <ArtCard {...props} />
  return <PairCard {...props} />
}

function PairCard({ template, onOpen, eager }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const alt = useTranslations('app.template')('cardAlt', { name: template.name })
  useHoverWipe(ref)
  const { before, after, type, motion } = template.cover
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      onClick={() => onOpen(template.id)}
      className="group block w-full rounded-tile text-left transition-transform duration-250 ease-house hover:-translate-y-0.5 active:scale-[.97]"
    >
      {before && after ? (
        <PairMedia before={before} after={after} alt={alt} eager={eager} video={type === 'video' && motion ? motion : undefined} className="transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--input)]" />
      ) : isMotion(template) ? (
        <LoopPlate template={template} alt={alt} />
      ) : (
        <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
      )}
      <CardMeta template={template} />
    </button>
  )
}

// The one card with the drag compare (Art Styles): a tap on the photo opens the dialog, a drag
// compares; the name and price below are their own button for the keyboard. From md up it is the
// tall card spanning two rows (the grid sets the span).
function ArtCard({ template, onOpen }: Props) {
  const t = useTranslations('app.template')
  return (
    <div className="flex h-full flex-col rounded-tile">
      <CompareSlider
        before={template.cover.before as string}
        after={template.cover.after as string}
        afterAlt={t('resultAlt', { name: template.name })}
        onTap={() => onOpen(template.id)}
        tagsAt="bottom"
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
  const label = useCategoryLabel()
  const category = label(template.category)
  const kind = isMotion(template) ? t(template.cover.type === 'video' ? 'featureMeta' : 'animatedMeta', { category }) : category
  return (
    <span className="block pt-2">
      <span className="block text-body leading-[1.25] font-semibold tracking-[-0.015em]">{template.name}</span>
      <span className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{kind}</span>
      <span className="mt-2 inline-block rounded-tag bg-wash px-2 py-1 font-mono text-caption leading-none text-bone-dim">{t('fromCredits', { count: cardPrice(template) })}</span>
    </span>
  )
}
