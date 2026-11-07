'use client'

/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo */
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { useReveal } from '@/core/ui/reveal'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { TemplateSample } from '../catalogue/template-sample'
import type { BatchPhoto } from './photo-batch'

// The workspace's right column from lg up, the "stage" (B comp workspace.html .stage): a 4:5
// tray that always fits the viewport, sticky under the nav. Before a photo it shows the
// template's example; once one is picked, that photo as shot. Below lg it is not drawn: the
// phone form is one column (DESIGN §8.6, the one desktop-only layout).
export function WorkspaceStage({ template, photo }: { template: CatalogueTemplate; photo: BatchPhoto | null }) {
  const t = useTranslations('app')
  const reveal = useReveal<HTMLElement>()
  return (
    <aside ref={reveal} aria-label={t('workspace.stageLabel')} className="hidden pt-4 lg:sticky lg:top-[72px] lg:block">
      <div className="hairline relative mx-auto aspect-[4/5] w-[min(100%,calc((100dvh-220px)*0.8))] overflow-hidden rounded-panel bg-background">
        {photo ? (
          <>
            <img src={photo.url} alt={t('workspace.photoAlt')} className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover`} />
            <span className="absolute inset-x-3 top-3 z-2 flex justify-between">
              <Pill>{t('workspace.stageYours')}</Pill>
              {photo.ratio ? (
                <Pill>
                  <span className="font-mono">{photo.ratio}</span> · {t('sizes.asShot')}
                </Pill>
              ) : null}
            </span>
          </>
        ) : (
          <TemplateSample template={template} fill />
        )}
      </div>
      <p className="mt-3 text-center text-caption text-muted-foreground">{t(photo ? 'workspace.stageYoursCaption' : 'workspace.stageSampleCaption')}</p>
    </aside>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="frost inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-caption leading-none font-medium text-photo-ink">{children}</span>
}
