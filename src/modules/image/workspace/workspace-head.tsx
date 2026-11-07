'use client'

import { coverImage } from '@/core/ui/cover-image'
import { useReveal } from '@/core/ui/reveal'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { useCategoryLabel } from '../catalogue/category-label'
import { GroundedImg } from '../result/grounded-img'

// Under the nav: the template's result thumbnail, its name in the display serif, and
// "category · what it does" (B comp workspace.html ".head").
export function WorkspaceHead({ template }: { template: CatalogueTemplate }) {
  const label = useCategoryLabel()
  const reveal = useReveal<HTMLDivElement>()
  const thumb = template.cover.after ?? template.cover.poster
  const line = [label(template.category), template.description].filter(Boolean).join(' · ')
  return (
    <div ref={reveal} className="flex items-center gap-4 px-(--gutter) pt-2 pb-1 lg:pt-6">
      {thumb ? <GroundedImg ground="white" {...coverImage(thumb, '56px')} alt="" className="hairline h-[70px] w-14 flex-none rounded-inner object-cover" /> : null}
      <div className="min-w-0">
        <h1 className="font-display text-title leading-none tracking-[-0.02em]">{template.name}</h1>
        <p className="mt-1 text-caption text-pretty text-muted-foreground">{line}</p>
      </div>
    </div>
  )
}
