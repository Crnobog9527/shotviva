/* eslint-disable @next/next/no-img-element -- cover on the public assets bucket */
import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// Under the nav: the template's result thumbnail, its name in the display serif, and its
// category (B comp workspace.html ".head").
export function WorkspaceHead({ template }: { template: CatalogueTemplate }) {
  const thumb = template.cover.after ?? template.cover.poster
  return (
    <div className="flex items-center gap-4 px-4 pt-2 pb-1">
      {thumb ? <img src={thumb} alt="" className="hairline h-[70px] w-14 flex-none rounded-inner object-cover" /> : null}
      <div className="min-w-0">
        <h1 className="font-display text-title leading-none tracking-[-0.02em]">{template.name}</h1>
        <p className="mt-1 text-caption text-muted-foreground">{template.category}</p>
      </div>
    </div>
  )
}
