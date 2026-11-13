import type { ReactNode } from 'react'

import type { AdminInquiry } from '@/core/inquiries'
import { CopyText } from '@/core/ui/copy-text'

import { formatBeijing } from '../shell/format'
import { UserLink } from '../users-ui/user-link'
import { INQUIRIES_COPY as COPY } from './copy'
import { FollowUpForm, type InquiryAdminActions } from './follow-up-form'
import { StatusBadge } from './inquiries-view'

type Props = { inquiry: AdminInquiry; actions: InquiryAdminActions }

// The inquiry dialog on /admin/inquiries (?inquiry=<id>): everything the visitor sent, grouped as the form asks it, then the
// Owner's follow-up (status and a private note).
export function InquiryDetailView({ inquiry, actions }: Props) {
  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={inquiry.status} />
        <span className="font-mono text-xs text-muted-foreground">{formatBeijing(inquiry.created_at)}</span>
      </div>
      <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{inquiry.company}</h2>
      <Contact inquiry={inquiry} />
      <Block title={COPY.sections.company}>
        <Row label={COPY.fields.company} value={inquiry.company} />
        <Row label={COPY.fields.website} value={inquiry.website ? <WebsiteLink website={inquiry.website} /> : null} />
        <Row label={COPY.fields.country} value={inquiry.country} />
        <Row label={COPY.fields.teamSize} value={inquiry.team_size ? COPY.teamSizes[inquiry.team_size] : null} />
        <Row label={COPY.fields.platforms} value={listOf(inquiry.platforms.map((p) => COPY.platforms[p]))} />
      </Block>
      <Block title={COPY.sections.needs}>
        <Row label={COPY.fields.volume} value={COPY.volumes[inquiry.monthly_volume]} />
        <Row label={COPY.fields.uses} value={listOf(inquiry.uses.map((u) => COPY.uses[u]))} />
        <Row label={COPY.fields.needs} value={listOf(inquiry.needs.map((n) => COPY.needs[n]))} />
        <Row label={COPY.fields.startTime} value={inquiry.start_time ? COPY.startTimes[inquiry.start_time] : null} />
        <Row label={COPY.fields.message} value={<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{inquiry.message}</p>} />
        <Row label={COPY.fields.source} value={COPY.sources[inquiry.locale]} />
      </Block>
      <FollowUpForm inquiry={inquiry} save={actions.save} />
    </div>
  )
}

function Contact({ inquiry }: { inquiry: AdminInquiry }) {
  return (
    <Block title={COPY.sections.contact}>
      <Row label={COPY.fields.name} value={inquiry.name} />
      <Row
        label={COPY.fields.email}
        value={
          <span className="flex flex-wrap items-center gap-3">
            <Copy value={inquiry.email} />
            <a href={`mailto:${inquiry.email}`} className="text-sm text-primary hover:underline">
              {COPY.writeEmail}
            </a>
          </span>
        }
      />
      <Row label={COPY.fields.jobTitle} value={inquiry.job_title} />
      <Row label={COPY.fields.phone} value={inquiry.phone ? <Copy value={inquiry.phone} /> : null} />
      <Row label={COPY.fields.wechat} value={inquiry.wechat ? <Copy value={inquiry.wechat} /> : null} />
      <Row
        label={COPY.fields.account}
        value={inquiry.user_id ? <UserLink userId={inquiry.user_id}>{COPY.openUser}</UserLink> : COPY.noAccount}
      />
    </Block>
  )
}

const Copy = ({ value }: { value: string }) => <CopyText value={value} label={COPY.copy} copied={COPY.copied} className="[overflow-wrap:anywhere]" />

const listOf = (labels: string[]) => (labels.length > 0 ? labels.join('、') : null)

// Only http(s) addresses become links; a bare domain gets https:// in front. Anything else is text.
function WebsiteLink({ website }: { website: string }) {
  const href = /^https?:\/\//i.test(website) ? website : /^[\p{L}\p{N}-]+\./u.test(website) ? `https://${website}` : null
  if (!href) return <span className="[overflow-wrap:anywhere]">{website}</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline [overflow-wrap:anywhere]">
      {website}
    </a>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[9rem_1fr]">{children}</dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </>
  )
}
