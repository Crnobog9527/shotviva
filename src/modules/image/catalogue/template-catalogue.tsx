'use client'

import { useState } from 'react'

import { categoriesOf, isMotion, type CatalogueTemplate } from './catalogue-template'
import { ALL, CategoryChips } from './category-chips'
import { FeatureCard } from './feature-card'
import { PreviewSheet } from './preview-sheet'
import { TemplateCard } from './template-card'

// Create's catalogue (B comp create.html): the featured video card, a sticky chip bar, the
// two-column grid, and the preview sheet every card opens (DESIGN §4.2).
export function TemplateCatalogue({ templates }: { templates: CatalogueTemplate[] }) {
  const [category, setCategory] = useState(ALL)
  const [openId, setOpenId] = useState<string | null>(null)
  const featured = templates.find((t) => isMotion(t) && t.cover.type === 'video')
  const shown = category === ALL ? templates : templates.filter((t) => t.category === category)
  const open = templates.find((t) => t.id === openId) ?? null

  if (templates.length === 0) {
    return <p className="px-4 pt-6 text-body text-muted-foreground">Templates are on their way. Check back soon.</p>
  }
  return (
    <>
      {featured ? <FeatureCard template={featured} onOpen={setOpenId} /> : null}
      <div className="nav-material sticky top-0 z-40 mt-4 py-2 pt-[calc(var(--sat)+8px)]">
        <CategoryChips categories={categoriesOf(templates)} value={category} onChange={setCategory} />
      </div>
      <h2 className="sr-only">Templates</h2>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-5 px-4 md:grid-cols-3">
        {shown.map((template, index) => (
          <li key={template.id}>
            <TemplateCard template={template} onOpen={setOpenId} eager={index < 4} />
          </li>
        ))}
      </ul>
      <p className="px-4 pt-4 pb-2 text-caption leading-[1.4] text-muted-foreground">Template images are illustrative examples.</p>
      <PreviewSheet template={open} onClose={() => setOpenId(null)} />
    </>
  )
}
