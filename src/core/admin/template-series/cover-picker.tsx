'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { CoverField } from './cover-field'
import { seriesCopy as copy } from './copy'
import { SaveFeedback } from './save-feedback'
import type { SeriesActions, SeriesDetail } from './types'
import { saveSeriesSchema } from './validation'

// 换封面 straight from the list (Owner 2026-11-13): the same choice as the editor's cover field and
// 设为系列封面, saved through the same series save with everything else unchanged.
export function CoverPicker({ detail, save }: { detail: SeriesDetail; save: SeriesActions['save'] }) {
  const [cover, setCover] = useState(detail.cover_url)
  const [error, setError] = useState('')
  const [pending, run] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const { id, revision, members, ...fields } = detail
  const withCovers = members.filter(member => member.cover_url)
  function submit() {
    setError('')
    const input = saveSeriesSchema.safeParse({ id, revision, fields: { ...fields, cover_url: cover }, members: members.map(m => m.id), reason: null })
    if (!input.success) return setError(copy.invalid)
    run(async () => {
      try {
        const result = await save(input.data)
        if (result.ok) router.replace(pathname + '?saved=1', { scroll: false })
        else setError(result.message)
      } catch { setError(copy.transient) }
    })
  }
  return (
    <fieldset disabled={pending} className="grid min-w-0 gap-5">
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">{copy.pickFromMembers}</h2>
        {withCovers.length ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {withCovers.map(member => {
              const chosen = member.cover_url === cover
              return (
                <li key={member.id}>
                  <button type="button" aria-pressed={chosen} onClick={() => setCover(member.cover_url)}
                    // Focus only tints (the dialog focuses the first tile on open); the orange ring means chosen.
                    className={cn('hover:bg-muted focus-visible:bg-muted grid w-full gap-1 rounded-md p-1 text-left outline-none',
                      chosen && 'ring-primary ring-2')}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin-only, the same still the editor shows */}
                    <img src={member.cover_url ?? ''} alt="" loading="lazy" className="bg-muted aspect-[4/5] w-full rounded object-cover" />
                    <span className="truncate text-xs">{member.name}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {chosen ? copy.usingCover : member.is_active ? copy.published : copy.unpublished}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : <p className="text-muted-foreground text-sm">{copy.noMemberCovers}</p>}
      </section>
      <CoverField url={cover} change={setCover} />
      <footer className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={cover === detail.cover_url}>{pending ? copy.busy : copy.saveCover}</Button>
        <Button variant="outline" onClick={() => router.replace(pathname, { scroll: false })}>{copy.cancel}</Button>
        <SaveFeedback error={error} reload={() => router.refresh()} />
      </footer>
    </fieldset>
  )
}
