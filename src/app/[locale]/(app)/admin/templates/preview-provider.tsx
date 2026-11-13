'use client'

import type { ReactNode } from 'react'

import { TemplatePreviewProvider, type TemplatePreviewProps } from '@/core/admin/templates-editor'
import { TemplateCreatePreview } from '@/modules/image/template-preview'

// Hands the template editor the user-facing creation dialog for its 实时预览: core cannot import
// modules, so the page joins the two here.
const render = (props: TemplatePreviewProps) => <TemplateCreatePreview {...props} />

export function AdminTemplatePreview({ children }: { children: ReactNode }) {
  return <TemplatePreviewProvider preview={render}>{children}</TemplatePreviewProvider>
}
