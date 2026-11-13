'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { Template } from '@/core/templates/types'

export type PreviewWidth = 'desktop' | 'phone'
export type PreviewLocale = 'zh' | 'en'

// What the user-facing creation dialog is drawn from: the draft template and its series panel.
export type TemplatePreviewProps = { template: Template; series: { name: string; members: Template[] } | null; width: PreviewWidth; locale: PreviewLocale }

// core cannot import modules (AGENTS §3), so the admin page hands the editor the real creation
// dialog (modules/image) through this slot; without it the 实时预览 button is not offered.
export type RenderPreview = (props: TemplatePreviewProps) => ReactNode

const PreviewSlot = createContext<RenderPreview | null>(null)

export function TemplatePreviewProvider({ preview, children }: { preview: RenderPreview; children: ReactNode }) {
  return <PreviewSlot value={preview}>{children}</PreviewSlot>
}

export const useTemplatePreview = () => useContext(PreviewSlot)
