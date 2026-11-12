'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import type { CatalogueSection } from './catalogue-sections'
import type { GridEntry } from './catalogue-view'
import { SeriesCard } from './series-card'
import { TemplateCard } from './template-card'

type Props = {
  sections: readonly CatalogueSection[]
  onOpen(id: string): void
  onOpenSeries(slug: string): void
  onSeeAll(section: CatalogueSection): void
}

// Create's All (Owner 2026-11-12): a section per root category in 分类管理's order, its heading,
// 首页说明 and 「查看全部 N」 (the same as tapping that category's chip). On phones each section is
// a horizontal rail (CSS scroll-snap, no script) whose next card peeks in and which ends on a
// 「查看全部」 card; from md up it is one row of the grid. Cards keep the catalogue's own order.
// A section of drag compares (画风) is a two-column grid of four on phones instead: the compare
// takes horizontal drags, so it cannot sit in a rail that scrolls sideways.
export function CatalogueSections({ sections, onOpen, onOpenSeries, onSeeAll }: Props) {
  const t = useTranslations('app.create')
  return (
    <div className="mt-2 grid gap-8 md:mt-3 md:gap-10">
      {sections.map((section, sectionIndex) => {
        const headingId = `create-section-${section.slug}`
        const seeAll = t('seeAllAria', { name: section.name, count: section.total })
        return (
          <section key={section.slug} aria-labelledby={headingId} className="min-w-0">
            <Reveal className="flex items-baseline gap-2 px-(--gutter)">
              <h3 id={headingId} className="shrink-0 text-body leading-[1.25] font-semibold tracking-[-0.015em]">{section.name}</h3>
              {section.intro ? <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{section.intro}</p> : <span className="flex-1" />}
              <button type="button" aria-label={seeAll} onClick={() => onSeeAll(section)}
                className="press -my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-inner ps-2 text-caption font-medium text-foreground">
                {t('seeAll')}
                <span className="font-mono text-muted-foreground">{section.total}</span>
                <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
              </button>
            </Reveal>
            {section.compare ? (
              <ul className="mt-2 grid grid-cols-2 gap-3 px-(--gutter) md:mt-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
                {section.entries.slice(0, COMPARE_SHOWN).map((entry, index) => (
                  <li key={entryKey(entry)} className={cn(index === COMPARE_SHOWN - 1 && 'md:hidden lg:block')}>
                    <Card entry={entry} eager={sectionIndex === 0 && index < 2} onOpen={onOpen} onOpenSeries={onOpenSeries} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={cn(
                'no-scrollbar mt-2 flex snap-x snap-mandatory scroll-px-(--gutter) gap-3 overflow-x-auto px-(--gutter) pb-1',
                'md:mt-3 md:grid md:snap-none md:grid-cols-2 md:gap-4 md:overflow-visible md:pb-0 lg:grid-cols-3',
              )}>
                {section.entries.map((entry, index) => (
                  <li key={entryKey(entry)} className={cn('w-[calc(100%-4rem)] max-w-96 flex-none snap-start md:w-auto md:max-w-none', fromMd(index))}>
                    <Card entry={entry} eager={sectionIndex === 0 && index < 2} onOpen={onOpen} onOpenSeries={onOpenSeries} />
                  </li>
                ))}
                {section.total > section.entries.length ? (
                  <li className="flex w-28 flex-none snap-start md:hidden">
                    <button type="button" aria-label={seeAll} onClick={() => onSeeAll(section)}
                      className="press hairline flex w-full flex-col items-center justify-center gap-1 rounded-tile bg-wash text-caption font-medium">
                      {t('seeAll')}
                      <span className="font-mono text-muted-foreground">{t('seeAllCount', { count: section.total })}</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

const entryKey = (entry: GridEntry) => (entry.type === 'series' ? `series-${entry.series.id}` : entry.template.id)

// Drag compares shown: four on phones (two rows of two), three from md, four from lg.
const COMPARE_SHOWN = 4

type CardProps = { entry: GridEntry; eager: boolean; onOpen(id: string): void; onOpenSeries(slug: string): void }

function Card({ entry, eager, onOpen, onOpenSeries }: CardProps) {
  if (entry.type === 'series') return <SeriesCard series={entry.series} onOpen={() => onOpenSeries(entry.series.slug)} eager={eager} />
  return <TemplateCard template={entry.template} onOpen={onOpen} eager={eager} />
}

// From md up a rail becomes one row: two cards at md, three from lg; the rest stay in the
// phone's rail only.
function fromMd(index: number): string {
  if (index >= 3) return 'md:hidden'
  if (index >= 2) return 'md:hidden lg:block'
  return ''
}
