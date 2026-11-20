'use client'

import { useTranslations } from 'next-intl'

import { CatalogueFormStatus } from '../catalogue/catalogue-form-status'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { isCompareSample } from '../catalogue/template-sample'
import { ZoomableSample } from '../catalogue/zoomable-sample'
import { CreateSheet } from './create-sheet'

type Props = { template: CatalogueTemplate; open: boolean; failed: boolean; onClose(): void; retry(): void }

export function PendingCatalogueForm({ template, open, failed, onClose, retry }: Props) {
  const t = useTranslations('app.template')
  const tall = isCompareSample(template)
  return (
    <CreateSheet open={open} onOpenChange={(next) => !next && onClose()}
      title={template.name} description={[template.categoryName, template.description].filter(Boolean).join(' · ')}
      hint={t(tall ? 'hintCompare' : 'hintPair')} tall={tall} folded={false}
      sample={<ZoomableSample template={template} />}
      form={<CatalogueFormStatus failed={failed} retry={retry} />} bar={null} />
  )
}
