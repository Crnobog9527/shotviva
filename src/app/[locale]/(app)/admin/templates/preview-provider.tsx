'use client'

import { NextIntlClientProvider, useTimeZone, type AbstractIntlMessages } from 'next-intl'
import type { ReactNode } from 'react'

import { TemplatePreviewProvider, type TemplatePreviewProps } from '@/core/admin/templates-editor'
import { TemplateCreatePreview } from '@/modules/image/template-preview'

// Hands the template editor the user-facing creation dialog for its 实时预览: core cannot import
// modules, so the page joins the two here. /admin renders in English (the default locale), so
// the Chinese preview gets the zh copy the dialog reads (app, paywall) from the page.
export function AdminTemplatePreview({ zhMessages, children }: { zhMessages: AbstractIntlMessages; children: ReactNode }) {
  const timeZone = useTimeZone()
  const render = ({ locale, ...props }: TemplatePreviewProps) => locale === 'zh'
    ? <NextIntlClientProvider locale="zh" messages={zhMessages} timeZone={timeZone}><TemplateCreatePreview {...props} /></NextIntlClientProvider>
    : <TemplateCreatePreview {...props} />
  return <TemplatePreviewProvider preview={render}>{children}</TemplatePreviewProvider>
}
