'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { AdminAnnouncementRow } from '@/core/announcements/rules'
import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { AnnouncementFormDialog } from './announcement-form-dialog'
import { AnnouncementsTable } from './announcements-table'
import { ANNOUNCEMENTS_COPY as COPY } from './copy'
import { emptyForm, toForm, toSaveInput, wouldStop, type AnnouncementForm } from './form-state'
import { SwitchDialog } from './switch-dialog'

export type AnnouncementAdminActions = {
  save: (input: unknown) => Promise<ActionValue<string>>
  setActive: (input: { id: string; active: boolean }) => Promise<ActionValue<string[]>>
}

type Props = {
  rows: AdminAnnouncementRow[]
  nextHref: string | null
  now: number
  actions: AnnouncementAdminActions
}

// /admin/announcements (ARCHITECTURE §10): list, add / edit, switch on / off.
export function AnnouncementsEditor({ rows, nextHref, now, actions }: Props) {
  const [editing, setEditing] = useState<{ row: AdminAnnouncementRow | null } | null>(null)
  const [switching, setSwitching] = useState<AdminAnnouncementRow | null>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()

  const save = (form: AnnouncementForm) =>
    run(
      () => actions.save(toSaveInput(form, editing?.row?.id)),
      () => {
        setEditing(null)
        return COPY.form.saved
      },
    )
  const toggle = (row: AdminAnnouncementRow) =>
    run(
      () => actions.setActive({ id: row.id, active: !row.is_active }),
      (stopped) => {
        setSwitching(null)
        return row.is_active ? COPY.deactivated : COPY.activated(stopped.length)
      },
    )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{COPY.intro}</p>
        <Button className="ml-auto" onClick={() => (clearError(), setEditing({ row: null }))}>
          {COPY.add}
        </Button>
      </div>
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {error && !editing ? <p className="text-sm text-destructive">{error}</p> : null}
      <AnnouncementsTable rows={rows} now={now} pending={pending} onEdit={(row) => (clearError(), setEditing({ row }))} onSwitch={setSwitching} />
      {nextHref ? (
        <Link href={nextHref} className="justify-self-center text-sm text-primary hover:underline">
          {COPY.loadMore}
        </Link>
      ) : null}
      {editing ? (
        <AnnouncementFormDialog
          open
          isNew={editing.row === null}
          initial={editing.row ? toForm(editing.row) : emptyForm()}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
      <SwitchDialog
        target={switching}
        stops={switching ? wouldStop(switching, rows) : []}
        pending={pending}
        onCancel={() => setSwitching(null)}
        onConfirm={toggle}
      />
    </div>
  )
}
