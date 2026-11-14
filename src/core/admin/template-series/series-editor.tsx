'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import { Link } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'

import { CoverField } from './cover-field'
import { SaveFeedback } from './save-feedback'
import { UnpublishSheet } from './unpublish-sheet'
import { CandidatePicker } from './candidate-picker'
import { seriesCopy as copy } from './copy'
import { SeriesFields, type SeriesCategoryChoice } from './series-fields'
import { SeriesMembers } from './series-members'
import type { CandidatePage, SeriesActions, SeriesDetail, SeriesFields as Fields } from './types'
import { saveSeriesSchema } from './validation'

const empty: Fields = {
  slug: '', name_en: '', name_zh: '', description_en: null, description_zh: null, cover_url: null,
  category_key: '', sort_order: 0, is_active: false, show_members: false,
}

// `embedded`: inside the list's dialog, which has its own title and close (Owner 2026-11-12).
type Props = { detail: SeriesDetail | null; choices: SeriesCategoryChoice[]; initial: CandidatePage; actions: SeriesActions; embedded?: boolean }

export function SeriesEditor({ detail, choices, initial, actions, embedded = false }: Props) {
  const [fields, setFields] = useState<Fields>(detail ?? empty)
  const [members, setMembers] = useState(detail?.members ?? [])
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [pending, run] = useTransition()
  const pathname = usePathname()
  const router = useRouter()
  const patch = (changes: Partial<Fields>) => setFields(prev => ({ ...prev, ...changes }))
  function save(reason: string | null) {
    setError('')
    const input = saveSeriesSchema.safeParse({
      id: detail?.id ?? null, revision: detail?.revision ?? null, fields, members: members.map(m => m.id), reason,
    })
    if (!input.success) return setError(copy.invalid)
    if (detail?.is_active && !fields.is_active && !reason) return setConfirm(true)
    setConfirm(false)
    run(async () => {
      try {
        const result = await actions.save(input.data)
        if (result.ok) router.replace(pathname + '?saved=1', { scroll: false })
        else setError(result.message)
      } catch { setError(copy.transient) }
    })
  }
  return (
    <Shell embedded={embedded} title={detail ? copy.edit : copy.create}>
      <fieldset disabled={pending} className="grid min-w-0 gap-6">
        <SeriesFields fields={fields} patch={patch} choices={choices} />
        <CoverField url={fields.cover_url} change={cover_url => patch({ cover_url })} />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <SeriesMembers members={members} change={setMembers} cover={fields.cover_url} chooseCover={cover_url => patch({ cover_url })} />
          <CandidatePicker seriesId={detail?.id ?? null} selected={new Set(members.map(m => m.id))}
            search={actions.search} initial={initial} add={m => setMembers(prev => [...prev, m])} />
        </div>
        <footer className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save(null)}>{pending ? copy.busy : copy.save}</Button>
          <SaveFeedback error={error} reload={() => router.refresh()} />
        </footer>
      </fieldset>
      {confirm && <UnpublishSheet open close={() => setConfirm(false)} submit={save} />}
    </Shell>
  )
}

// The page around the editor; inside the list's dialog, which has its own title, just a grid.
function Shell({ embedded, title, children }: { embedded: boolean; title: string; children: ReactNode }) {
  if (embedded) return <div className="grid min-w-0 gap-5">{children}</div>
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Link href="/admin/templates/series" className="text-sm underline">{copy.back}</Link>
      </header>
      {children}
    </main>
  )
}
