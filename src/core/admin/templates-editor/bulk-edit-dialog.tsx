'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import type { CreditsFloor } from '@/core/templates/pricing'

import { bulkEditFailures, isEmptyPatch } from '../templates/bulk-edit-rules'
import type { AdminTemplate } from '../templates/types'
import { BulkEditFields } from './bulk-edit-fields'
import { BulkEditReview } from './bulk-edit-review'
import { readBulkEdit } from './bulk-edit-state'
import { bulkEditCopy as COPY } from './copy'
import type { BulkEditState } from './use-bulk-edit'

type Props = { edit: BulkEditState; templates: AdminTemplate[]; floor: CreditsFloor }

// Batch edit (T79): fill in what changes → review the changes, the templates and any that
// would fail → one all-or-nothing save.
export function BulkEditDialog({ edit, templates, floor }: Props) {
  const { patch, problems } = readBulkEdit(edit.values)
  const empty = isEmptyPatch(patch)
  const invalid = Object.keys(problems).length > 0
  // The server's list when it refused; until then, the same rules run here.
  const failures = edit.failures ?? bulkEditFailures(templates, patch, floor)
  const reviewing = edit.step === 'review'
  return (
    <Dialog open={edit.open} onOpenChange={(open) => !open && !edit.pending && edit.close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{reviewing ? COPY.reviewTitle(templates.length) : COPY.title(templates.length)}</DialogTitle>
          <DialogDescription>{COPY.hint}</DialogDescription>
        </DialogHeader>
        {reviewing ? (
          <BulkEditReview templates={templates} patch={patch} failures={failures} />
        ) : (
          <BulkEditFields values={edit.values} problems={problems} floor={floor} onChange={edit.setValues} />
        )}
        {edit.error ? (
          <p role="alert" className="text-destructive text-sm">
            {edit.error}
          </p>
        ) : null}
        {!reviewing && empty && !invalid ? <p className="text-muted-foreground text-sm">{COPY.nothing}</p> : null}
        <BulkEditFooter
          edit={edit}
          canReview={!empty && !invalid}
          canSave={failures.length === 0}
          onSave={() => edit.save(templates.map((template) => template.id), patch)}
          count={templates.length}
        />
      </DialogContent>
    </Dialog>
  )
}

type FooterProps = { edit: BulkEditState; canReview: boolean; canSave: boolean; onSave: () => void; count: number }

function BulkEditFooter({ edit, canReview, canSave, onSave, count }: FooterProps) {
  const reviewing = edit.step === 'review'
  return (
    <DialogFooter>
      <Button variant="outline" disabled={edit.pending} onClick={reviewing ? edit.back : edit.close}>
        {reviewing ? COPY.back : COPY.cancel}
      </Button>
      {reviewing ? (
        <Button disabled={edit.pending || !canSave} onClick={onSave}>
          {COPY.confirm(count)}
        </Button>
      ) : (
        <Button disabled={!canReview} onClick={edit.review}>
          {COPY.next}
        </Button>
      )}
    </DialogFooter>
  )
}
