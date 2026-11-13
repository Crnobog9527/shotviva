'use client'

import { useState } from 'react'
import type { CreditsFloor } from '@/core/templates/pricing'

import { Label } from '@/core/ui/label'
import { Button } from '@/core/ui/button'
import { DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { ImageProviderField, type ImageProviderOption } from '../image-provider-field'
import type { AdminTemplate, CoverLanguage, TemplateAdminActions } from '../templates/types'
import { afterCoverSource, type AfterCover } from '../covers/client'

import { CategoryField, type CategoryOption } from './category-field'
import { categoryCopy, fallbackPriceCopy } from './copy'
import { EditorSection, SectionNav } from './editor-sections'
import type { TemplateFormValues } from './form-state'
import type { SectionId } from './layout-copy'
import { useOpenSections, type OpenSections } from './open-sections'
import { TemplateHistory, type VersionActions } from './prompt-history'
import { SaleSwitch } from './sale-switch'
import { referenceBudget, refUploadId } from './style-ref-state'
import { StyleRefFields } from './style-ref-fields'
import { TemplateAdvancedFields } from './template-advanced-fields'
import { TemplateCopyFields } from './template-copy-fields'
import { TemplateCoverFields } from './template-cover-fields'
import { TemplatePriceFields } from './template-price-fields'
import { TemplatePromptFields } from './template-prompt-fields'
import { TemplatePublicFields } from './template-public-fields'
import { TemplateSlotFields } from './template-slot-fields'
import { TemplateToggleFields } from './template-toggle-fields'

export type FormColumnProps = {
  existing: AdminTemplate | null
  providers: readonly ImageProviderOption[]
  floor: CreditsFloor
  categories: readonly CategoryOption[]
  series: readonly { id: string; nameZh: string; nameEn?: string }[]
  coverLanguages: readonly CoverLanguage[]
  coverActions: Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover' | 'setSale'> & VersionActions
  values: TemplateFormValues
  onChange: (patch: Partial<TemplateFormValues>) => void
  // pending / error / saved (this dialog's own last save, shown by the button) and the two buttons.
  footer: Omit<FooterProps, 'saveDisabled'>
}

const SHOWN: readonly SectionId[] = ['basic', 'category', 'covers', 'prompt', 'pricing', 'form', 'advanced']

// The editor's fields in collapsible sections under a pinned section nav (Owner 2026-11-13: the
// one long form made a field hard to find). Every field is still here, in the same components.
export function FormColumn(props: FormColumnProps) {
  const { existing, providers, values, footer } = props
  const [uploading, setUploading] = useState(false)
  const sections = useOpenSections()
  const budget = referenceBudget(providers, values.providerId, values.fieldsJson, values.styleRefs.length)
  return (
    <div className="grid min-h-0 content-start gap-3 px-6 pb-6 lg:overflow-y-auto">
      <SectionNav sections={sections} shown={SHOWN} />
      <DialogHeader className="pt-2">
        <DialogTitle>{existing ? `编辑「${existing.name}」` : '新建模板'}</DialogTitle>
      </DialogHeader>
      <FormSections {...props} sections={sections} uploading={uploading} setUploading={setUploading} budget={budget} />
      {!existing ? <p className="text-muted-foreground text-xs">新模板保存后默认是下架状态，保存后留在这里，右侧就能试跑。</p> : null}
      <FormFooter {...footer} saveDisabled={uploading || (values.module === 'image' && !!budget.problem)} />
    </div>
  )
}

type SectionsProps = FormColumnProps & {
  sections: OpenSections; uploading: boolean; setUploading: (value: boolean) => void; budget: ReturnType<typeof referenceBudget>
}

function FormSections({ existing, providers, floor, categories, series, coverLanguages, coverActions, values, onChange, footer, sections, uploading, setUploading, budget }: SectionsProps) {
  const [activeCover, setActiveCover] = useState(0)
  const cover = afterCoverSource(existing, coverLanguages[activeCover]!.code)
  const modelField = values.module === 'image' && (
    <>
      <ImageProviderField id="tpl-provider" providers={providers} value={values.providerId} onChange={(providerId) => onChange({ providerId })} />
      <FallbackPrice providers={providers} values={values} />
    </>
  )
  return (
    <>
      <EditorSection id="basic" sections={sections}>
        <TemplatePublicFields values={values} isNew={!existing} uploading={uploading} onChange={onChange} />
      </EditorSection>
      <EditorSection id="category" sections={sections}>
        <CategoryField value={values.category} categories={categories} onChange={(category) => onChange({ category })} />
        <SeriesField template={existing} series={series} value={values.seriesId} onChange={seriesId => onChange({ seriesId })} />
      </EditorSection>
      <EditorSection id="covers" sections={sections}>
        {existing ? <TemplateCoverFields template={existing} languages={coverLanguages} actions={coverActions} active={activeCover} onSelect={setActiveCover} />
          : <p className="text-muted-foreground text-xs">保存模板后再打开编辑，即可上传封面。</p>}
        <StyleSection cover={cover} values={values} budget={budget} uploading={uploading} setUploading={setUploading} onChange={onChange} />
      </EditorSection>
      <EditorSection id="prompt" sections={sections}>
        <TemplatePromptFields values={values} version={existing?.prompt?.version ?? null} onChange={onChange} />
        <TemplateHistory template={existing} values={values} disabled={footer.pending || uploading} actions={coverActions} providers={providers} onChange={onChange} />
      </EditorSection>
      <EditorSection id="pricing" sections={sections}>
        <SaleSwitch template={existing} action={coverActions.setSale} disabled={footer.pending} />
        <TemplatePriceFields modelField={modelField} values={values} floor={floor} onChange={onChange} />
      </EditorSection>
      <EditorSection id="form" sections={sections}>
        <TemplateSlotFields values={values} onChange={onChange} />
        <TemplateCopyFields values={values} onChange={onChange} />
        <TemplateToggleFields values={values} onChange={onChange} />
      </EditorSection>
      <EditorSection id="advanced" sections={sections}>
        <TemplateAdvancedFields values={values} onChange={onChange} />
      </EditorSection>
    </>
  )
}

function SeriesField({ template, series, value, onChange }: {
  template: AdminTemplate | null; series: FormColumnProps['series']; value: string | null; onChange: (id: string | null) => void
}) {
  if (template?.categoryInfo.isSystem) return null
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="tpl-series">{categoryCopy.series}</Label>
      <select id="tpl-series" className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
        <option value="">{categoryCopy.standalone}</option>
        {series.map(item => <option key={item.id} value={item.id}>{item.nameZh}</option>)}
      </select>
    </div>
  )
}

function FallbackPrice({ providers, values }: Pick<FormColumnProps, 'providers' | 'values'>) {
  const active = providers.find(option => option.isActive)
  if (!values.providerId || values.providerId === active?.id) return null
  return <p className="text-muted-foreground text-xs">{fallbackPriceCopy(active?.fallbackFloors?.[values.quality])}</p>
}

function StyleSection({ cover, values, budget, uploading, setUploading, onChange }: Pick<FormColumnProps, 'values' | 'onChange'> & {
  cover: AfterCover | null; budget: ReturnType<typeof referenceBudget>; uploading: boolean; setUploading: (value: boolean) => void
}) {
  if (values.module !== 'image') return null
  return <StyleRefFields cover={cover} templateId={refUploadId(values.id)} refs={values.styleRefs} budget={budget}
    busy={uploading} onBusy={setUploading} onChange={styleRefs => onChange({ styleRefs, styleRefsEdited: true })} />
}

type FooterProps = { pending: boolean; error: string | null; saved: string | null; onCancel: () => void; onSave: () => void; saveDisabled: boolean }

function FormFooter({ pending, error, saved, onCancel, onSave, saveDisabled }: FooterProps) {
  return (
    <>
      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <DialogFooter className="items-center">
        {saved && !error && !pending ? <p className="text-sm text-emerald-700 sm:mr-auto dark:text-emerald-400">{saved}</p> : null}
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          关闭
        </Button>
        <Button onClick={onSave} disabled={pending || saveDisabled}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </DialogFooter>
    </>
  )
}
