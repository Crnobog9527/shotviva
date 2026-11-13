'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import type { ProviderFloors } from '@/core/templates/provider-pricing'
import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { profileCopy as copy } from './copy'
import { modelLabel, RESOLUTION_LABEL } from './labels'
import { ProfileEditor, type ProfileEditorActions } from './profile-editor'
import { SwitchPanel, type SwitchAction } from './switch-panel'
import { PROFILES, type DriftRow, type ImageModel, type ProfileKey, type ProfileSummary, type ProfileTemplate } from './types'

type Choice = { key: string; label: string }
type Props = {
  templates: ProfileTemplate[]; models: ImageModel[]; floors: ProviderFloors; categories: Choice[]; series: Choice[]
  production: boolean; drift: DriftRow[]; actions: ProfileEditorActions & { switch: SwitchAction }
  initialFilter?: string
}

function prices(summary: ProfileSummary) {
  return (['1k', '2k', '4k'] as const).filter(tier => !summary.unpricedResolutions.includes(tier))
    .map(tier => `${RESOLUTION_LABEL[tier]} ${summary.creditsCost[tier]}`).join(' · ')
}

// 供应商配置 (Owner 2026-11-13): each template's two setups side by side, the bulk switch, and the
// editor for the setup that is not live.
export function ProfilesPage({ templates, models, floors, categories, series, production, drift, actions, initialFilter = '' }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState(initialFilter)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ template: ProfileTemplate; profile: ProfileKey } | null>(null)
  const [single, setSingle] = useState<{ ids: string[]; target: ProfileKey } | null>(null)
  const names = useMemo(() => new Map(templates.map(t => [t.id, t.nameZh ?? t.name])), [templates])
  const query = filter.trim().toLowerCase()
  const shown = templates.filter(t => !query || t.id.includes(query) || (t.nameZh ?? t.name).toLowerCase().includes(query))
  const eligible = (t: ProfileTemplate) => t.category !== 'art-styles'
  const allChecked = shown.length > 0 && shown.filter(eligible).every(t => selected.has(t.id))
  const toggle = (id: string, on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })

  function cell(t: ProfileTemplate, profile: ProfileKey) {
    const summary = t.profiles[profile]
    const live = t.active === profile
    if (!summary) {
      return <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{copy.none}</span>
        {eligible(t) && <Button size="sm" variant="outline" onClick={() => setEditing({ template: t, profile })}>{copy.create}</Button>}
      </div>
    }
    return <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {live && <Badge>{copy.live}</Badge>}
        <span>{modelLabel(models, live ? t.liveProviderId : summary.providerId, copy[profile])}</span>
      </div>
      <span className="text-muted-foreground text-xs">{prices(summary)}</span>
      {summary.providerUnmatched && <span className="text-destructive text-xs">{copy.unmatched(summary.providerUnmatched.model)}</span>}
      {eligible(t) && <div className="flex flex-wrap gap-2">
        {live
          ? <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/templates?edit=${t.id}`)}>{copy.editLive}</Button>
          : <>
            <Button size="sm" variant="outline" onClick={() => setEditing({ template: t, profile })}>{copy.edit}</Button>
            <Button size="sm" variant="outline" onClick={() => setSingle({ ids: [t.id], target: profile })}>{copy.switchTo}</Button>
          </>}
      </div>}
    </div>
  }

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{copy.title}</h1>
        <button type="button" className="text-sm underline underline-offset-4" onClick={() => router.push('/admin/templates')}>{copy.back}</button>
      </div>
      <p className="text-muted-foreground text-sm">{copy.intro}</p>
      {production && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">{copy.production}</p>}
      {drift.length > 0 && <p className="rounded-md border border-destructive p-3 text-sm text-destructive">
        {copy.drift(drift.length)}{drift.map(row => `${row.templateId}（${row.problem}）`).join('、')}
      </p>}
      <SwitchPanel categories={categories} series={series} selected={[...selected]} names={names} action={actions.switch}
        onDone={() => router.refresh()} />
      {single && <div className="grid gap-2">
        <SwitchPanel key={single.ids[0] + single.target} categories={categories} series={series} selected={single.ids} names={names}
          preset={single} action={actions.switch} onDone={() => router.refresh()} />
        <Button variant="ghost" className="justify-self-end" onClick={() => setSingle(null)}>{copy.close}</Button>
      </div>}
      <Input className="max-w-sm" placeholder={copy.filter} value={filter} onChange={e => setFilter(e.target.value)} />
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8"><Checkbox checked={allChecked} aria-label="全选"
            onCheckedChange={on => setSelected(on ? new Set(shown.filter(eligible).map(t => t.id)) : new Set())} /></TableHead>
          <TableHead>{copy.colTemplate}</TableHead>
          {PROFILES.map(profile => <TableHead key={profile}>{copy[profile]}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {shown.map(t => (
            <TableRow key={t.id}>
              <TableCell>{eligible(t) && <Checkbox checked={selected.has(t.id)} aria-label={t.id} onCheckedChange={on => toggle(t.id, on === true)} />}</TableCell>
              <TableCell className="whitespace-normal">{t.nameZh ?? t.name}
                <div className="text-muted-foreground text-xs">{t.id}{t.isActive ? '' : ' · 未上架'}{eligible(t) ? '' : ' · 画风'}</div>
              </TableCell>
              {PROFILES.map(profile => <TableCell key={profile} className="whitespace-normal align-top">{cell(t, profile)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing && <ProfileEditor key={editing.template.id + editing.profile} template={editing.template} profile={editing.profile}
        models={models} floors={floors} actions={actions} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  )
}
