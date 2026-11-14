'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, type CSSProperties, type ReactNode } from 'react'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { CatalogueSeries, CatalogueView, GridEntry } from '../catalogue/catalogue-view'
import { CategoryChips } from '../catalogue/category-chips'
import { SearchBox } from '../catalogue/search-box'
import { useFavorites } from '../favorites/favorites-provider'
import { savedIn } from '../favorites/favorites-store'
import { GroundedImg } from '../result/grounded-img'
import { PickerRow } from './picker-body'
import { thumbImage } from './thumb-image'
import { usePickerBrowse, type PickerBrowseState } from './use-picker-browse'

type Props = {
  view: CatalogueView
  selected: CatalogueTemplate
  onSelect(id: string): void
  thumbOf(template: CatalogueTemplate): string | null
  // Set while a search is typed, so phones can fold the sample away above the results.
  onSearching(searching: boolean): void
}

// The chips sit flush with the list, not the page gutter Create gives them.
const FLUSH = { '--gutter': '0px' } as CSSProperties

// The picker's right column (Owner 2026-11-13): a search box, Create's category chips (root,
// then sub-categories; Saved first when the visitor has saved templates, T83), and the list
// under them: templates as radios, a series as one row that opens its members.
export function PickerBrowser({ view, selected, onSelect, thumbOf, onSearching }: Props) {
  const t = useTranslations('home.generator')
  const ids = useFavorites()?.ids
  const openable = useMemo(() => view.entries.flatMap((entry) => (entry.type === 'template' ? [entry.template] : entry.series.members)), [view.entries])
  const saved = ids ? savedIn(ids, openable) : []
  const state = usePickerBrowse(view, saved)
  const labels = { all: t('pickerAll'), filter: t('pickerFilter'), filterWithin: (name: string) => t('pickerFilterWithin', { name }) }
  const row = (template: CatalogueTemplate) => (
    <PickerRow key={template.id} template={template} chosen={template.id === selected.id} onSelect={onSelect} thumb={thumbOf(template)} />
  )
  return (
    <>
      <div className="mk-pk-tools">
        <SearchBox
          value={state.query}
          onChange={(next) => {
            state.search(next)
            onSearching(next.trim() !== '')
          }}
          label={t('pickerSearch')}
          clear={t('pickerClear')}
        />
        {state.results ? null : (
          <div style={FLUSH}>
            <CategoryChips filters={view.filters} saved={saved.length > 0} value={state.selection} onChange={state.select} labels={labels} />
          </div>
        )}
      </div>
      <div className="mk-pk-list">
        <PickerListBody state={state} row={row} thumbOf={thumbOf} />
      </div>
    </>
  )
}

type BodyProps = { state: PickerBrowseState; row(template: CatalogueTemplate): ReactNode; thumbOf(template: CatalogueTemplate): string | null }

function PickerListBody({ state, row, thumbOf }: BodyProps) {
  const t = useTranslations('home.generator')
  if (state.results) {
    return (
      <>
        <p className="sr-only" aria-live="polite">{t('pickerResults', { count: state.results.length })}</p>
        {state.results.length ? <div role="radiogroup" aria-label={t('pickerSearch')} className="contents">{state.results.map(row)}</div> : <p className="mk-pk-none">{t('pickerNoMatch', { query: state.query.trim() })}</p>}
      </>
    )
  }
  if (state.series) {
    const { series } = state
    return (
      <>
        <button type="button" className="mk-pk-back" onClick={() => state.openSeries(null)}>
          <ChevronLeft aria-hidden className="size-4" />
          {t('pickerBack')}
        </button>
        <PickerGroup name={series.name}>{series.members.map(row)}</PickerGroup>
      </>
    )
  }
  const entry = (item: GridEntry) =>
    item.type === 'template' ? row(item.template) : <SeriesRow key={`series-${item.series.id}`} series={item.series} onOpen={state.openSeries} thumbOf={thumbOf} />
  return state.groups.map((group) => (
    <PickerGroup key={group.key} name={group.name}>
      {group.entries.map(entry)}
    </PickerGroup>
  ))
}

// One radio group per heading; a series row sits among the radios as a plain button.
function PickerGroup({ name, children }: { name: string | null; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={name ?? undefined} className="contents">
      {name ? (
        <p className="mk-pk-cat" aria-hidden>
          {name}
        </p>
      ) : null}
      {children}
    </div>
  )
}

type SeriesRowProps = { series: CatalogueSeries; onOpen(id: string): void; thumbOf(template: CatalogueTemplate): string | null }

// A series (系列): its cover (or first member's) on two stacked prints, its name and size; a tap
// lists its members in place, with a way back.
function SeriesRow({ series, onOpen, thumbOf }: SeriesRowProps) {
  const t = useTranslations('home.generator')
  const first = series.members[0]
  const thumb = series.cover ?? (first ? thumbOf(first) : null)
  return (
    <button type="button" className="mk-pk-row" onClick={() => onOpen(series.id)}>
      <span className="mk-pk-stack" aria-hidden>
        {thumb ? <GroundedImg className="mk-pk-th" ground="white" {...thumbImage(thumb, 44)} alt="" loading="lazy" decoding="async" /> : <span className="mk-pk-th" />}
      </span>
      <span className="mk-pk-t">
        <b>{series.name}</b>
        <small>{t('pickerSeries', { count: series.members.length })}</small>
      </span>
      <ChevronRight aria-hidden className="size-4 flex-none text-muted-foreground" />
    </button>
  )
}
