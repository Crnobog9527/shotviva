import { MutationForm } from './form'
import type { ViewProps } from './members-view'
import { GridTable, Hidden, Section } from './parts'
import { PROMO_COPY as P } from './promo-copy'
import { promoPartners, promoSheets, type PromoPartner } from './promo-read'
import { PromoSheetCard } from './promo-sheet'
import { currentPeriod, promoTopups, topupsOf } from './promo-topup-read'
import { PromoTopups } from './promo-topups-view'

// The 免费推广积分 tab (ARCHITECTURE §6.5 渠道商推广积分): the pending notice, "generate now", the
// monthly sheets (with the month's top-ups), the ad-hoc top-ups per partner and the channel
// partner switch per org.

function Partners({ partners, action }: { partners: PromoPartner[]; action: ViewProps['action'] }) {
  return (
    <Section title={P.partners}>
      <p className="text-sm text-muted-foreground">{P.partnersHint}</p>
      {partners.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-muted-foreground">{P.noPartners}</p>
      ) : (
        <GridTable
          heads={[P.orgCol, P.partnerCol, '']}
          rows={partners.map((o) => ({
            key: o.id,
            cells: [
              o.status === 'active' ? o.name : o.name + P.suspended,
              o.promo_partner ? P.isPartner : P.notPartner,
              <MutationForm key="f" action={action} operation="promoPartner" label={o.promo_partner ? P.markOff : P.markOn} destructive={o.promo_partner}>
                <Hidden name="org_id" value={o.id} />
                <Hidden name="on" value={String(!o.promo_partner)} />
              </MutationForm>,
            ],
          }))}
        />
      )}
    </Section>
  )
}

export async function PromoView({ db, action }: ViewProps) {
  const [sheets, partners, topups] = await Promise.all([promoSheets(db), promoPartners(db), promoTopups(db)])
  const now = new Date()
  const period = currentPeriod(now)
  const waiting = sheets.filter((s) => s.status === 'pending' && new Date(s.expires_at) > now).length
  return (
    <div className="grid gap-8">
      <Section title={P.title}>
        <p className="text-sm text-muted-foreground">{P.intro}</p>
        {waiting > 0 && (
          <p role="status" className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm font-medium">
            {P.pendingNotice(waiting)}
          </p>
        )}
        <MutationForm action={action} operation="promoRun" label={P.runNow}>
          <p className="text-sm text-muted-foreground">{P.runHint}</p>
        </MutationForm>
      </Section>
      <Section title={P.sheets}>
        {sheets.length === 0 ? (
          <p className="rounded border border-dashed p-4 text-muted-foreground">{P.noSheets}</p>
        ) : (
          sheets.map((s) => <PromoSheetCard key={s.id} sheet={s} topups={topupsOf(topups, s.org_id, s.period).sum} action={action} now={now} />)
        )}
      </Section>
      <PromoTopups partners={partners} sheets={sheets} topups={topups} period={period} action={action} />
      <Partners partners={partners} action={action} />
    </div>
  )
}
