'use client'

import { useTranslations } from 'next-intl'

export function CatalogueFormStatus({ failed, retry }: { failed: boolean; retry(): void }) {
  const t = useTranslations('app.create')
  if (!failed) return <p role="status" className="py-4 text-caption text-muted-foreground">{t('formLoading')}</p>
  return (
    <div className="flex flex-wrap items-center gap-3 py-4 text-caption">
      <p role="alert" className="text-muted-foreground">{t('formLoadFailed')}</p>
      <button type="button" onClick={retry} className="press underline">{t('formRetry')}</button>
    </div>
  )
}
