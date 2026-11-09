import { randomUUID } from 'node:crypto'
import { COPY } from './copy'
import { MutationForm, type SaveAction } from './form'
import { Field, Hidden, Select } from './parts'
import { Rates, type Rate } from './rates'
import type { Member } from './read'

function Slug({ value }: { value?: string }) {
  return <Field label={COPY.slug} name="slug" pattern={'[a-z0-9\\-]{3,24}'} minLength={3} maxLength={24} defaultValue={value} required />
}
export function CreateMember({ action }: { action: SaveAction }) {
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer font-medium">{COPY.create}</summary>
      <MutationForm action={action} operation="create" label={COPY.create}>
        <p className="text-sm text-muted-foreground">{COPY.inviteHint}</p>
        <Field label={COPY.email} type="email" name="email" required />
        <Slug />
        <Rates optional />
      </MutationForm>
    </details>
  )
}
export function DecideMember({ member, action }: { member: Member; action: SaveAction }) {
  if (member.application?.source === 'admin_invite') return <p>{COPY.awaitInvite}</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MutationForm action={action} operation="approve" label={COPY.approve}>
        <Hidden name="user_id" value={member.user_id} />
        <Slug value={member.slug} />
      </MutationForm>
      <MutationForm action={action} operation="reject" label={COPY.reject} destructive>
        <Hidden name="user_id" value={member.user_id} />
        <Field name="reason" label={COPY.reason} required maxLength={2000} />
      </MutationForm>
    </div>
  )
}
export function SetMember({ member, rates, action }: { member: Member; rates: Rate[]; action: SaveAction }) {
  return (
    <MutationForm action={action} operation="set" label={COPY.save}>
      <Hidden name="user_id" value={member.user_id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Slug value={member.slug} />
        <Select label={COPY.status} name="status" initial={member.status} values={['active', 'suspended', 'banned']} />
        <Field label={COPY.parent} name="parent_user_id" defaultValue={member.parent_user_id ?? ''} />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="team_enabled" defaultChecked={member.team_enabled} />
          {COPY.team}
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="void_unconfirmed" />
        {COPY.voidUnconfirmed}
      </label>
      <Rates values={rates} optional />
    </MutationForm>
  )
}
export function Adjust({ id, action }: { id: string; action: SaveAction }) {
  return (
    <MutationForm action={action} operation="adjust" label={COPY.adjust}>
      <Hidden name="user_id" value={id} />
      <Hidden name="request_id" value={randomUUID()} />
      <Field label={COPY.adjustmentAmount} type="number" step=".01" name="amount" required />
      <Field label={COPY.reason} name="reason" required maxLength={2000} />
    </MutationForm>
  )
}
