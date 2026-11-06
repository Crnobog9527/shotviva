'use client'

import { useTranslations } from 'next-intl'

import { CardMedia } from './card-media'
import { cardPrice, type CatalogueTemplate } from './catalogue-template'
import { useCategoryLabel } from './category-label'

// Template card (DESIGN §4.2): one button that opens the preview sheet. Below the media: name,
// what it is for, and the Standard price on a bone-wash plate.
export function TemplateCard({ template, onOpen, eager }: { template: CatalogueTemplate; onOpen(id: string): void; eager?: boolean }) {
  const t = useTranslations('app.template')
  const label = useCategoryLabel()
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onOpen(template.id)}
      className="block w-full rounded-tile text-left transition-transform duration-200 ease-house active:scale-[.97]"
    >
      <CardMedia template={template} eager={eager} />
      <span className="block pt-2">
        <span className="block text-body leading-[1.25] font-semibold tracking-[-0.015em]">{template.name}</span>
        <span className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{label(template.category)}</span>
        <span className="mt-2 inline-block rounded-tag bg-wash px-2 py-1 font-mono text-caption leading-none text-bone-dim">
          {t('fromCredits', { count: cardPrice(template) })}
        </span>
      </span>
    </button>
  )
}
