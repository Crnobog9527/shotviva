import { DOSSIER } from './copy'
import type { DossierDetail } from './dossier-read'
import { MutationForm, type SaveAction } from './form'
import { Field, Hidden } from './parts'

// Admin-only name and note. They live on the dossier itself (not under "manage") because the
// point is telling members apart at a glance, and they apply to members in any status.
export function AnnotateMember({ member, action }: { member: DossierDetail; action: SaveAction }) {
  return (
    <MutationForm action={action} operation="annotate" label={DOSSIER.annotate}>
      <Hidden name="user_id" value={member.user_id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={DOSSIER.adminLabel} name="admin_label" maxLength={60} defaultValue={member.admin_label ?? ''} />
        <Field label={DOSSIER.adminNote} name="admin_note" maxLength={2000} defaultValue={member.admin_note ?? ''} />
      </div>
      <p className="text-xs text-muted-foreground">{DOSSIER.adminLabelHint}</p>
    </MutationForm>
  )
}
