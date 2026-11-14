'use client'

import { useState } from 'react'

import { coverImage } from '@/core/ui/cover-image'
import { useReveal } from '@/core/ui/reveal'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { GroundedImg } from '../result/grounded-img'
import { pendingHeadShown } from './pending-template'

// Under the nav: the template's result thumbnail, its name in the display serif, and
// "category · what it does" (B comp workspace.html ".head").
export function WorkspaceHead({ template }: { template: CatalogueTemplate }) {
  const reveal = useReveal<HTMLDivElement>()
  // Decided once, as this head mounts: when the pending view already has the head on screen
  // (pending-template.ts), this one takes over as it is instead of fading in a second time.
  const [takesOver] = useState(() => pendingHeadShown(template.id))
  const thumb = template.cover.after ?? template.cover.poster
  const line = [template.categoryName, template.description].filter(Boolean).join(' · ')
  return (
    <div ref={takesOver ? undefined : reveal} className="flex items-center gap-4 px-(--gutter) pt-2 pb-1 lg:pt-6">
      {thumb ? <GroundedImg ground="white" {...coverImage(thumb, '56px')} alt="" className="hairline h-[70px] w-14 flex-none rounded-inner object-cover" /> : null}
      <div className="min-w-0">
        <h1 className="font-display text-title leading-none tracking-[-0.02em]">{template.name}</h1>
        <p className="mt-1 text-caption text-pretty text-muted-foreground">{line}</p>
      </div>
    </div>
  )
}
