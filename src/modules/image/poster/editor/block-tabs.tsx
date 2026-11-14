'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type ComponentType, type ReactNode } from 'react'

import type { PosterFields } from '@/core/poster'
import { cn } from '@/core/ui/cn'
import { FoldSection } from '@/core/ui/fold-section'

import type { BlockProps } from './block-props'
import { foldsOf, foldStats, type Fold, type FoldStats } from './block-folds'
import { FooterEditor } from './footer-editor'
import { HeaderEditor } from './header-editor'
import { pageGroups, type PageGroup } from './page-groups'
import { PrizesEditor } from './prizes-editor'
import { AddSectionButton, InfoHeadingEditor, SectionEditor } from './sections-editor'
import { TableEditor } from './table-editor'

const EDITORS: Record<'prizes' | 'table' | 'footer' | 'info', ComponentType<BlockProps>> = {
  prizes: PrizesEditor, table: TableEditor, footer: FooterEditor, info: InfoHeadingEditor,
}

// A page's upload boxes (e.g. the prize photo): drawn as a part of its own, with how many hold a photo.
export type PagePhotos = { render(kind: string): ReactNode; count(kind: string): { label: string; filled: number; total: number } | null }

type Props = BlockProps & { poster: PosterFields; unverified: readonly string[]; pagePhotos?: PagePhotos }

// One tab for what both pages share, then one per page of the set; a dot marks a tab with lines
// still to check. Inside a tab its blocks fold into titled parts (Owner 2026-11-14), the first
// open, each saying how much is filled and how many lines are still to check.
export function BlockTabs({ poster, unverified, pagePhotos, ...props }: Props) {
  const groups = pageGroups(poster)
  const [current, setCurrent] = useState(groups[0]?.key ?? 'shared')
  const foldsFor = (group: PageGroup) => foldsOf(group.blocks, props.content, Boolean(group.kind && pagePhotos?.count(group.kind)))
  const [open, setOpen] = useState<string[]>(() => groups.flatMap((group) => foldsFor(group).slice(0, 1).map((fold) => `${group.key}:${fold.key}`)))
  const toggle = (id: string) => setOpen((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]))
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
      <div role="tabpanel" className="grid gap-3">
        {group ? foldsFor(group).map((fold) => {
          const id = `${group.key}:${fold.key}`
          return (
            <PartFold key={id} id={id} fold={fold} kind={group.kind} open={open.includes(id)} onToggle={() => toggle(id)}
              unverified={unverified} pagePhotos={pagePhotos} onSectionAdded={(index) => setOpen((ids) => [...ids, `${group.key}:section-${index}`])} {...props} />
          )
        }) : null}
      </div>
    </div>
  )
}

type PartProps = BlockProps & { id: string; fold: Fold; kind: string | null; open: boolean; onToggle(): void; unverified: readonly string[]; pagePhotos?: PagePhotos; onSectionAdded(index: number): void }

function PartFold({ id, fold, kind, open, onToggle, unverified, pagePhotos, onSectionAdded, ...props }: PartProps) {
  const t = useTranslations('app.poster')
  const photos = fold.kind === 'photos' && kind ? pagePhotos?.count(kind) ?? null : null
  const stats = photos ?? foldStats(fold, props.content, unverified)
  return (
    <>
      <FoldSection id={`poster-${id.replace(':', '-')}`} level={3} title={photos?.label ?? foldTitle(fold, props.content, t)} open={open} onToggle={onToggle}
        summary={<FoldSummary stats={{ flagged: 0, ...stats }} />}>
        <FoldBody fold={fold} kind={kind} pagePhotos={pagePhotos} {...props} />
      </FoldSection>
      {endsSections(fold, props.content) ? <AddSectionButton content={props.content} onChange={props.onChange} onAdded={onSectionAdded} /> : null}
    </>
  )
}

// The add-a-section button sits under the last section (under the heading when there is none).
const endsSections = (fold: Fold, content: BlockProps['content']) =>
  fold.kind === 'info' ? content.sections.length === 0 : fold.kind === 'section' && fold.index === content.sections.length - 1

function FoldBody({ fold, kind, pagePhotos, ...props }: BlockProps & { fold: Fold; kind: string | null; pagePhotos?: PagePhotos }) {
  if (fold.kind === 'header') return <HeaderEditor keys={fold.keys} {...props} />
  if (fold.kind === 'section') return <SectionEditor index={fold.index} {...props} />
  if (fold.kind === 'photos') return kind && pagePhotos ? <div className="grid gap-4">{pagePhotos.render(kind)}</div> : null
  const Editor = EDITORS[fold.kind]
  return <Editor {...props} />
}

type T = ReturnType<typeof useTranslations<'app.poster'>>

function foldTitle(fold: Fold, content: BlockProps['content'], t: T): string {
  if (fold.kind === 'section') return content.sections[fold.index]?.title || t('folds.section', { n: fold.index + 1 })
  if (fold.kind === 'table') return content.table?.title || t('folds.table')
  return t(`folds.${fold.key as 'masthead' | 'title' | 'info' | 'prizes' | 'footer' | 'photos'}`)
}

function FoldSummary({ stats }: { stats: FoldStats }) {
  const t = useTranslations('app')
  const filled = t('workspace.groups.filled', { filled: stats.filled, total: stats.total })
  const done = stats.total > 0 && stats.filled === stats.total
  return (
    <>
      {stats.flagged > 0 ? <><span className="text-primary">{t('poster.folds.flagged', { count: stats.flagged })}</span> · </> : null}
      {filled}{done && stats.flagged === 0 ? <> · <span aria-label={t('workspace.groups.done')}>✓</span></> : null}
    </>
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
