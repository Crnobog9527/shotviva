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
    <article className="tc-tile">
      {before && after ? (
        <PairMedia before={before} after={after} alt={alt} eager={eager} sizes={COVER_SIZES.cardPlate} video={type === 'video' && motion ? motion : undefined} />
      ) : motion ? (
        <LoopPlate template={template} alt={alt} sizes={COVER_SIZES.cardFrame} />
      ) : (
        <span className="tc-blank" />
      )}
      <div className="tc-text">
        <h3 className="tc-name">{template.name}</h3>
        <p className="tc-meta">{template.categoryName}</p>
        {template.description ? <p className="tc-desc">{template.description}</p> : null}
      </div>
      <UseTemplateLink templateId={template.id} label={text.use} />
    </article>
  )
}
