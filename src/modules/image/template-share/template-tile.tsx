import { LoopPlate } from '../catalogue/card-media'
import { COVER_SIZES } from '../catalogue/cover-sizes'
import { PairMedia } from '../catalogue/pair-media'
import type { Shown } from '../share/load-shared-template'
import { UseTemplateLink } from './use-template-link'

export type TileText = { use: string; alt: string }

type Props = { template: Shown; text: TileText; eager?: boolean }

// One template on a collection page: its public cover pair (The Always-Visible Split Rule), name,
// description and its own way in. Nothing a catalogue card does not already show.
export function TemplateTile({ template, text, eager }: Props) {
  const { before, after, type, motion } = template.cover
  const alt = `${template.name} · ${text.alt}`
  return (
    <article className="grid content-start gap-3">
      {before && after ? (
        <PairMedia before={before} after={after} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} video={type === 'video' && motion ? motion : undefined} />
      ) : motion ? (
        <LoopPlate template={template} alt={alt} sizes={COVER_SIZES.cardFrame} />
      ) : (
        <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
      )}
      <div className="grid gap-1">
        <h3 className="text-body leading-[1.25] font-semibold tracking-[-0.015em]">{template.name}</h3>
        <p className="text-caption leading-[1.35] text-muted-foreground">{template.categoryName}</p>
        {template.description ? <p className="text-caption text-pretty text-bone-dim">{template.description}</p> : null}
      </div>
      <UseTemplateLink templateId={template.id} label={text.use} />
    </article>
  )
}
