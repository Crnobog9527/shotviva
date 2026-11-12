'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { BatchPhotos } from '../workspace/batch-photos'
import { ResolutionPicker, SizePicker } from '../workspace/option-pickers'
import { PhotoPickers } from '../workspace/photo-pickers'
import { sizeLabel } from '../workspace/workspace-options'
import { chosenAspect } from '../workspace/output-choice'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { MatrixGrid } from './matrix-grid'
import { MATRIX_MAX_CELLS, MATRIX_MAX_TEMPLATES, toggleCell, totalsByResolution, withoutTemplate, withTemplate } from './matrix-state'
import { TemplatePicker } from './template-picker'
import { TemplateSettings } from './template-settings'
import { TemplatesSection } from './templates-section'
import type { MatrixDraft } from './use-matrix-draft'

type Props = { draft: MatrixDraft; templates: readonly CatalogueTemplate[]; balancePaid: number }

// The multi-template batch form (T107), one column like the workspace (DESIGN §4.3): templates →
// photos → the grid with its prices → each template's text and options → the one size and
// resolution of the batch. From lg the grid moves to the right column, beside the form.
export function MatrixForm({ draft, templates, balancePaid }: Props) {
  const t = useTranslations('app')
  const [picking, setPicking] = useState(false)
  const { photos, values, change, chosen, cells } = draft
  const shown = photos.photos.filter((photo) => photo.upload.phase !== 'error')
  const grid = chosen.length > 0 && shown.length > 0 ? <MatrixGrid templates={chosen} photos={shown} cells={cells} total={draft.total} count={draft.count} onToggle={(key) => change((v) => toggleCell(v, key))} /> : null
  return (
    <>
      <Section id="tpl-h" title={t('matrix.templatesTitle')} aside={<Counter count={chosen.length} max={MATRIX_MAX_TEMPLATES} />}>
        <TemplatesSection chosen={chosen} failedId={draft.error?.template_id ?? null} onAdd={() => setPicking(true)} onRemove={(id) => change((v) => withoutTemplate(v, id))} />
      </Section>
      <Section id="photo-h" title={t('workspace.yourPhotos')} aside={shown.length ? <Counter count={photos.photos.length} max={MATRIX_MAX_CELLS} /> : null}>
        {photos.photos.length ? <BatchPhotos photos={photos.photos} max={MATRIX_MAX_CELLS} tier="max" onAdd={photos.add} onRemove={photos.remove} /> : <PhotoPickers onPick={photos.add} multiple />}
      </Section>
      {grid ? <Section id="grid-h" title={t('matrix.gridTitle')} className="lg:hidden">{grid}</Section> : null}
      <SettingsSection draft={draft} photos={shown} />
      {chosen.length > 0 ? <OutputSections draft={draft} balancePaid={balancePaid} firstRatio={shown[0]?.originalRatio} /> : null}
      <TemplatePicker open={picking} onOpenChange={setPicking} templates={templates} chosen={values.templateIds} onToggle={(id) => change((v) => (v.templateIds.includes(id) ? withoutTemplate(v, id) : withTemplate(v, id)))} />
    </>
  )
}

// Each template's own text and options; nothing when none of them has any.
function SettingsSection({ draft, photos }: { draft: MatrixDraft; photos: MatrixDraft['photos']['photos'] }) {
  const t = useTranslations('app.matrix')
  if (!draft.chosen.some((template) => template.copyFields.length > 0 || template.toggles.length > 0)) return null
  return (
    <Section id="set-h" title={t('settingsTitle')}>
      <div className="grid gap-3">
        {draft.chosen.map((template) => <TemplateSettings key={template.id} template={template} photos={photos} values={draft.values} onChange={draft.change} />)}
      </div>
    </Section>
  )
}

// Size and resolution, one choice for the whole batch, from what every chosen template offers;
// each resolution card shows what the whole batch would cost there.
function OutputSections({ draft, balancePaid, firstRatio }: { draft: MatrixDraft; balancePaid: number; firstRatio?: number }) {
  const t = useTranslations('app')
  const { options, values, change, cells } = draft
  const aspect = chosenAspect(values.aspect, options, firstRatio)
  return (
    <>
      <Section id="size-h" title={t('workspace.size')} aside={aspect ? <span className="text-caption text-muted-foreground">{sizeLabel(aspect, t)}</span> : null}>
        <SizePicker options={options} photoRatio={firstRatio} value={values.aspect} onChange={(next) => change((v) => ({ ...v, aspect: next }))} />
      </Section>
      {options.resolutions.length > 1 ? (
        <Section id="res-h" title={t('workspace.resolution')} aside={<span className="text-caption text-muted-foreground">{t('matrix.resolutionAside')}</span>}>
          <ResolutionPicker options={options} aspect={values.aspect} photoRatio={firstRatio} value={values.resolution} costs={totalsByResolution(cells)} balance={{ paid: balancePaid, free: 0 }} onChange={(next) => change((v) => ({ ...v, resolution: next }))} />
        </Section>
      ) : null}
    </>
  )
}

// Under the nav, like a template's workspace head: the page in the display serif and one line.
export function MatrixHead() {
  const t = useTranslations('app.matrix')
  return (
    <div className="pt-2 pb-1 lg:pt-6">
      <h1 className="font-display text-title leading-none tracking-[-0.02em]">{t('title')}</h1>
      <p className="mt-1.5 text-caption text-pretty text-muted-foreground">{t('lede', { templates: MATRIX_MAX_TEMPLATES, max: MATRIX_MAX_CELLS })}</p>
    </div>
  )
}

// The grid beside the form from lg up (the stage column of the workspace).
export function MatrixStage({ draft }: { draft: MatrixDraft }) {
  const t = useTranslations('app.matrix')
  const shown = draft.photos.photos.filter((photo) => photo.upload.phase !== 'error')
  return (
    <aside aria-labelledby="grid-lg-h" className="hidden lg:sticky lg:top-20 lg:block lg:max-w-[560px] lg:pt-6">
      <h2 id="grid-lg-h" className="mb-3 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('gridTitle')}</h2>
      {draft.chosen.length > 0 && shown.length > 0 ? (
        <MatrixGrid templates={draft.chosen} photos={shown} cells={draft.cells} total={draft.total} count={draft.count} onToggle={(key) => draft.change((v) => toggleCell(v, key))} />
      ) : (
        <p className="hairline rounded-panel bg-card p-5 text-caption leading-[1.45] text-muted-foreground">{t('gridEmpty', { max: MATRIX_MAX_CELLS, templates: MATRIX_MAX_TEMPLATES })}</p>
      )}
    </aside>
  )
}

function Counter({ count, max }: { count: number; max: number }) {
  return <span className="font-mono text-caption text-muted-foreground">{count} / {max}</span>
}

function Section({ id, title, aside, className, children }: { id: string; title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={className ? `pt-6 ${className}` : 'pt-6'}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
