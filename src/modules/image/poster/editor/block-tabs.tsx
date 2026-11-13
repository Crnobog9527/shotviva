'use client'

import { useTranslations } from 'next-intl'
import { useState, type ComponentType } from 'react'

import type { PosterBlock } from '@/core/poster'
import { cn } from '@/core/ui/cn'

import type { BlockProps } from './block-props'
import { FooterEditor } from './footer-editor'
import { HeaderEditor } from './header-editor'
import { PrizesEditor } from './prizes-editor'
import { SectionsEditor } from './sections-editor'
import { TableEditor } from './table-editor'

const EDITORS: Record<PosterBlock, ComponentType<BlockProps>> = {
  header: HeaderEditor, prizes: PrizesEditor, sections: SectionsEditor, table: TableEditor, footer: FooterEditor,
}

// One block at a time under a row of tabs; a dot marks a tab with lines still to check.
export function BlockTabs({ blocks, unverified, ...props }: BlockProps & { blocks: PosterBlock[]; unverified: readonly string[] }) {
  const t = useTranslations('app.poster')
  const [current, setCurrent] = useState<PosterBlock>(blocks[0] ?? 'header')
  const Editor = EDITORS[current]
  return (
    <div className="grid gap-4">
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {blocks.map((block) => {
          const pending = unverified.some((path) => path.startsWith(`${block}.`) || path === block)
          return (
            <button key={block} type="button" role="tab" aria-selected={current === block} onClick={() => setCurrent(block)}
              className={cn('relative min-h-11 shrink-0 rounded-button px-3 text-caption font-medium', current === block ? 'chosen' : 'hairline bg-card')}>
              {t(`tabs.${block}`)}
              {pending ? <span aria-label={t('tabs.pending')} className="absolute top-1 right-1 size-2 rounded-full bg-primary" /> : null}
            </button>
          )
        })}
      </div>
      <div role="tabpanel"><Editor {...props} /></div>
    </div>
  )
}
