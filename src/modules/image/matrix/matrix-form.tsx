'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import type { MembershipTier } from '@/core/config'

import { BatchPhotos } from '../workspace/batch-photos'
import { ResolutionPicker, SizePicker } from '../workspace/option-pickers'
import { PhotoPickers } from '../workspace/photo-pickers'
import { sizeLabel } from '../workspace/workspace-options'
import { chosenAspect } from '../workspace/output-choice'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { batchCounts, MATRIX_TEMPLATES, type BatchCaps } from '../gated/feature-access'
import { IntroTrigger } from '../gated/intro-trigger'
import { TierBadge } from '../gated/tier-badge'
import { MatrixGrid } from './matrix-grid'
import { pickTemplate, toggleCell, totalsByResolution, withoutTemplate } from './matrix-state'
import { TemplatePicker } from './template-picker'
import { TemplateSettings } from './template-settings'
import { TemplatesSection } from './templates-section'
import type { MatrixDraft } from './use-matrix-draft'

type Props = { draft: MatrixDraft; templates: readonly CatalogueTemplate[]; balancePaid: number; tier: MembershipTier | null }

// Batch create's form (T107, Owner 2026-11-12), one column like the workspace (DESIGN §4.3):
// templates → photos → the grid with its prices → each template's text and options → the one
// size and resolution of the batch. From lg the grid moves to the right column, beside the form.
// The plan's limits (draft.caps) shape it: on Pro one template, and the two places a Pro member
// reaches for more (a second template, a full tray) carry the locked Max mark, nothing else.
export function MatrixForm({ draft, templates, balancePaid, tier }: Props) {
  const t = useTranslations('app')
  const { caps, photos, change, chosen, cells } = draft
  const shown = photos.photos.filter((photo) => photo.upload.phase !== 'error')
  const grid = chosen.length > 0 && shown.length > 0 ? <MatrixGrid templates={chosen} photos={shown} cells={cells} total={draft.total} count={draft.count} max={caps.cells} onToggle={(key) => change((v) => toggleCell(v, key))} /> : null
  return (
    <>
      <TemplatesBlock draft={draft} templates={templates} tier={tier} />
      <Section id="photo-h" title={t('workspace.yourPhotos')} aside={shown.length ? <Counter count={photos.photos.length} max={caps.cells} /> : null}>
        {photos.photos.length ? <BatchPhotos photos={photos.photos} max={caps.cells} tier={tier} onAdd={photos.add} onRemove={photos.remove} /> : <PhotoPickers onPick={photos.add} multiple />}
        {caps.templates === 1 && photos.photos.length >= caps.cells ? <MoreLocked tier={tier} tab="batch" /> : null}
      </Section>
      {grid ? <Section id="grid-h" title={t('matrix.gridTitle')} className="lg:hidden">{grid}</Section> : null}
      <SettingsSection draft={draft} photos={shown} />
      {chosen.length > 0 ? <OutputSections draft={draft} balancePaid={balancePaid} firstRatio={shown[0]?.originalRatio} /> : null}
    </>
  )
}

// The batch's templates and their picker. With room for one (Pro) a tap in the picker is the
// choice and closes it; once one is in, its row offers Change (the picker again, a tap swaps it)
// and the add button gives way to the locked way to Max.
function TemplatesBlock({ draft, templates, tier }: { draft: MatrixDraft; templates: readonly CatalogueTemplate[]; tier: MembershipTier | null }) {
  const t = useTranslations('app.matrix')
  const [picking, setPicking] = useState(false)
  const { caps, values, change, chosen } = draft
  const single = caps.templates === 1
  return (
    <Section id="tpl-h" title={t('templatesTitle')} aside={<Counter count={chosen.length} max={caps.templates} />}>
      <TemplatesSection
        chosen={chosen}
        max={caps.templates}
        failedId={draft.error?.template_id ?? null}
        onAdd={() => setPicking(true)}
        onSwap={single ? () => setPicking(true) : undefined}
        onRemove={(id) => change((v) => withoutTemplate(v, id))}
        more={single && chosen.length === 1 ? <MoreLocked tier={tier} tab="templates" /> : null}
      />
      <TemplatePicker
        open={picking}
        onOpenChange={setPicking}
        templates={templates}
        chosen={values.templateIds}
        max={caps.templates}
        onToggle={(id) => {
          change((v) => pickTemplate(v, id, caps.templates))
          // With room for one a tap is the choice (or keeps it): the picker closes on it.
          if (single) setPicking(false)
        }}
      />
    </Section>
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
          <ResolutionPicker options={options} value={values.resolution} costs={totalsByResolution(cells)} balance={{ paid: balancePaid, free: 0 }} onChange={(next) => change((v) => ({ ...v, resolution: next }))} />
        </Section>
      ) : null}
    </>
  )
}

// Under the nav, like a template's workspace head: the page in the display serif and one line
// saying what this plan's batch holds (no caps: the locked page, which says what the plans hold).
export function MatrixHead({ caps }: { caps: BatchCaps | null }) {
  const t = useTranslations('app.matrix')
  const lede = useBatchLede(caps)
  return (
    <div className="pt-2 pb-1 lg:pt-6">
      <h1 className="font-display text-title leading-none tracking-[-0.02em]">{t('title')}</h1>
      <p className="mt-1.5 text-caption text-pretty text-muted-foreground">{lede}</p>
    </div>
  )
}

// The one line under Batch create's title: what this plan's batch holds.
export function useBatchLede(caps: BatchCaps | null): string {
  const t = useTranslations('app.matrix')
  const counts = batchCounts()
  if (!caps) return t('ledeLocked', { pro: counts.pro, max: counts.max, templates: MATRIX_TEMPLATES })
  return caps.templates > 1 ? t('lede', { templates: caps.templates, max: caps.cells }) : t('ledeOne', { max: caps.cells })
}

// Where a Pro member reaches for more than Pro holds: a second template, or photos past 10.
// One quiet line with the locked Max mark; it opens that feature's intro, then the paywall on
// Max (Owner 2026-11-12, intro first).
function MoreLocked({ tier, tab }: { tier: MembershipTier | null; tab: 'batch' | 'templates' }) {
  const t = useTranslations('app.matrix')
  const counts = batchCounts()
  const style = tab === 'templates'
    ? 'press flex min-h-14 w-full items-center justify-center gap-2 rounded-tile text-label font-semibold text-bone-dim shadow-[inset_0_0_0_1px_var(--input)] hover:text-foreground'
    : 'press mt-2 inline-flex min-h-11 items-center gap-2 text-caption font-medium text-bone-dim hover:text-foreground'
  return (
    <IntroTrigger tab={tab} tier={tier} upgrade="max" className={style}>
      {tab === 'templates' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ) : null}
      <span>{tab === 'templates' ? t('moreTemplates') : t('morePhotos', { count: counts.max })}</span>
      <TierBadge tier="max" locked />
    </IntroTrigger>
  )
}

// The grid beside the form from lg up (the stage column of the workspace).
// `className` replaces the page's sticky column (the dialog gives it a scrolling column).
export function MatrixStage({ draft, className = 'hidden lg:sticky lg:top-20 lg:block lg:max-w-[560px] lg:pt-6' }: { draft: MatrixDraft; className?: string }) {
  const t = useTranslations('app.matrix')
  const shown = draft.photos.photos.filter((photo) => photo.upload.phase !== 'error')
  return (
    <aside aria-labelledby="grid-lg-h" className={className}>
      <h2 id="grid-lg-h" className="mb-3 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('gridTitle')}</h2>
      {draft.chosen.length > 0 && shown.length > 0 ? (
        <MatrixGrid templates={draft.chosen} photos={shown} cells={draft.cells} total={draft.total} count={draft.count} max={draft.caps.cells} onToggle={(key) => draft.change((v) => toggleCell(v, key))} />
      ) : (
        <p className="hairline rounded-panel bg-card p-5 text-caption leading-[1.45] text-muted-foreground">{t(draft.caps.templates > 1 ? 'gridEmpty' : 'gridEmptyOne', { max: draft.caps.cells, templates: draft.caps.templates })}</p>
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
