import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Badge } from '@/core/ui/badge'
import { ConsumerReferral } from './consumer-referral'
import { COPY, DOSSIER } from './copy'
import { CreateMember } from './create-member'
import { DirectoryTable, DossierMetrics } from './dossier-directory'
import { dossier, dossiers } from './dossier-read'
import { ProfileFacts } from './dossier-profile'
import { DossierSections } from './dossier-sections'
import { enrollmentLabel } from './enrollment'
import type { SaveAction } from './form'
import { DecideMember, ReopenApplication, SetMember } from './member-forms'
import { Field, FiltersForm, LinkTo, NextPage, Select } from './parts'
import { href, type Filters } from './query'

export type ViewProps = { db: SupabaseClient; filters: Filters; action: SaveAction }
export type DossierProps = ViewProps & { actor: string; id: string }

export async function MembersView(props: ViewProps & { actor: string }) {
  const { db, actor, filters } = props
  if (filters.id && filters.q) redirect(href(filters))
  if (filters.id) return <MemberView {...props} id={filters.id} />
  const review = filters.tab === 'applications' ? filters.review ?? 'pending' : undefined
  const page = await dossiers(db, actor, { query: filters.q, cursor: filters.cursor, review })
  return (
    <>
      {filters.tab === 'affiliates' && <CreateMember />}
      <FiltersForm tab={filters.tab}>
        {review && <Select label={COPY.status} name="review" initial={review} values={['pending', 'rejected']} />}
        <Field label={COPY.search} placeholder={COPY.searchHint} name="q" className="w-80 max-w-full" defaultValue={filters.q} />
      </FiltersForm>
      <p className="text-xs text-muted-foreground">{DOSSIER.definitions}</p>
      <DirectoryTable items={page.items} filters={filters} />
      <NextPage filters={filters} cursor={page.nextCursor} />
    </>
  )
}

async function MemberView(props: DossierProps) {
  const { db, actor, action, id, filters } = props
  const member = await dossier(db, actor, id)
  if (!member) return <p>{COPY.noAffiliate}</p>
  return (
    <>
      <LinkTo filters={{ tab: filters.tab, review: filters.review }}>{COPY.previous}</LinkTo>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{member.name || DOSSIER.unnamed}</h2>
        <span className="font-mono text-sm text-muted-foreground">{member.slug}</span>
        <Badge variant="outline">{enrollmentLabel(member)}</Badge>
      </header>
      <DossierMetrics row={member} />
      <ProfileFacts member={member} />
      {member.status === 'pending' && <DecideMember member={member} action={action} />}
      {member.status === 'rejected' && <ReopenApplication member={member} action={action} />}
      {['active', 'suspended', 'banned'].includes(member.status) && (
        <details className="rounded-md border bg-card p-4">
          <summary className="cursor-pointer font-medium">{DOSSIER.manage}</summary>
          <div className="mt-4 grid gap-3">
            {member.status === 'active' && <ConsumerReferral slug={member.slug} />}
            <SetMember member={member} rates={member.rates} action={action} />
            <div className="flex gap-4">
              <LinkTo filters={{ tab: 'commissions', affiliate: id }}>{COPY.commissions}</LinkTo>
              <LinkTo filters={{ tab: 'commissions', affiliate: id, flag: 'yes' }}>{COPY.flagged}</LinkTo>
              <LinkTo filters={{ tab: 'payouts', affiliate: id }}>{COPY.payouts}</LinkTo>
            </div>
          </div>
        </details>
      )}
      <DossierSections {...props} />
    </>
  )
}
