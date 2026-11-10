'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Link } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'
import { Textarea } from '@/core/ui/textarea'

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

type Props = { detail: SeriesDetail | null; choices: SeriesCategoryChoice[]; initial: CandidatePage; actions: SeriesActions }

function UnpublishSheet({ open, close, submit }: { open: boolean; close: () => void; submit: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <ResponsiveSheet open={open} onOpenChange={on => !on && close()} title={copy.confirmTitle} description={copy.confirmText}>
      <label className="mt-3 grid gap-2 text-sm">{copy.reason}
        <Textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>{copy.cancel}</Button>
        <Button variant="destructive" disabled={!reason.trim()} onClick={() => submit(reason.trim())}>{copy.confirm}</Button>
      </div>
    </ResponsiveSheet>
  )
}

function SaveFeedback({ error, reload }: { error: string; reload: () => void }) {
  if (!error) return null
  return <>
    <p role="alert" className="text-destructive text-sm">{error}</p>
    {error === copy.changed && <Button variant="outline" onClick={reload}>{copy.reload}</Button>}
  </>
}

function CoverField({ url, change }: { url: string | null; change: (url: string | null) => void }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <label className="grid gap-1">{copy.cover}
        <Input type="url" placeholder={copy.automatic} maxLength={4096} value={url ?? ''} onChange={e => change(e.target.value || null)} />
      </label>
      <p className="text-muted-foreground text-xs">{copy.coverHint}</p>
      {url && <Button className="justify-self-start" variant="outline" size="sm" onClick={() => change(null)}>{copy.autoCover}</Button>}
    </div>
  )
}

export function SeriesEditor({ detail, choices, initial, actions }: Props) {
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
        if (result.ok) router.replace(pathname + '?saved=1')
        else setError(result.message)
      } catch { setError(copy.transient) }
    })
  }
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{detail ? copy.edit : copy.create}</h1>
        <Link href="/admin/templates/series" className="text-sm underline">{copy.back}</Link>
      </header>
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
    </main>
  )
}
