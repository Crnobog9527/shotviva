'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type ComponentType } from 'react'

import type { PosterBlock, PosterFields } from '@/core/poster'
import { cn } from '@/core/ui/cn'

import type { BlockProps } from './block-props'
import { FooterEditor } from './footer-editor'
import { HeaderEditor } from './header-editor'
import { pageGroups, type PageGroup } from './page-groups'
import { PrizesEditor } from './prizes-editor'
import { SectionsEditor } from './sections-editor'
import { TableEditor } from './table-editor'

const EDITORS: Record<PosterBlock, ComponentType<BlockProps>> = {
  header: HeaderEditor, prizes: PrizesEditor, sections: SectionsEditor, table: TableEditor, footer: FooterEditor,
}

type Props = BlockProps & { poster: PosterFields; unverified: readonly string[] }

// One tab for what both pages share, then one per page of the set; a dot marks a tab with lines
// still to check. Each tab shows its blocks one under the other, each under its own heading.
export function BlockTabs({ poster, unverified, ...props }: Props) {
  const groups = pageGroups(poster)
  const [current, setCurrent] = useState(groups[0]?.key ?? 'shared')
  const group = groups.find((item) => item.key === current) ?? groups[0]
  return (
    <div className="grid gap-4">
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {groups.map((item) => (
          <GroupTab key={item.key} group={item} poster={poster} chosen={item.key === group?.key}
            pending={unverified.some((path) => item.blocks.some((block) => path === block || path.startsWith(`${block}.`)))}
            onChoose={() => setCurrent(item.key)} />
        ))}
      </div>
      <div role="tabpanel" className="grid gap-6">
        {group?.blocks.map((block) => <BlockSection key={block} block={block} {...props} />)}
      </div>
    </div>
  )
}

type TabProps = { group: PageGroup; poster: PosterFields; chosen: boolean; pending: boolean; onChoose(): void }

function GroupTab({ group, poster, chosen, pending, onChoose }: TabProps) {
  const t = useTranslations('app.poster')
  const locale = useLocale()
  const kind = poster.kinds.find((item) => item.key === group.kind)
  const label = group.page === null ? t('pages.shared') : t('pages.page', { page: group.page, name: kind ? (locale === 'zh' ? kind.name.zh : kind.name.en) : '' })
  return (
    <button type="button" role="tab" aria-selected={chosen} onClick={onChoose}
      className={cn('relative min-h-11 shrink-0 rounded-button px-3 text-caption font-medium', chosen ? 'chosen' : 'hairline bg-card')}>
      {label}
      {pending ? <span aria-label={t('tabs.pending')} className="absolute top-1 right-1 size-2 rounded-full bg-primary" /> : null}
    </button>
  )
}

function BlockSection({ block, ...props }: BlockProps & { block: PosterBlock }) {
  const t = useTranslations('app.poster')
  const Editor = EDITORS[block]
  return (
    <section className="grid gap-3">
      <h3 className="text-label font-semibold">{t(`tabs.${block}`)}</h3>
      <Editor {...props} />
    </section>
  )
}
