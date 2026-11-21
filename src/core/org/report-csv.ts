// CSV of the owner's monthly report (ARCHITECTURE §6.5, card E5). Pure: the route resolves the
// labels and the member names, this only lays out rows and escapes cells.

// Quote every cell. A text cell that starts like a formula (= + - @, tab, carriage return) is
// prefixed with a quote so a spreadsheet shows it as text; numbers are written by us and never
// start that way.
export function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : /^[=+@\-\t\r]/.test(value) ? `'${value}` : value
  return '"' + text.replaceAll('"', '""') + '"'
}

export const csvLine = (values: readonly (string | number)[]) => values.map(csvCell).join(',') + '\r\n'

export const dollars = (cents: number) => (cents / 100).toFixed(2)

export type ReportRow = {
  account: string
  role: string
  status: string
  allocated: number
  used: number
  l1: { signups: number; paying: number; paidCents: number }
  l2: { signups: number; paying: number; paidCents: number }
}

export type MemberHeaders = {
  member: string; role: string; status: string; allocated: string; used: string
  l1Signups: string; l1Paying: string; l1Paid: string; l2Signups: string; l2Paying: string; l2Paid: string
}

// One row per member, then a totals row. The level-2 columns are there only when the org has them.
export function memberReportCsv(rows: readonly ReportRow[], headers: MemberHeaders, totalLabel: string, withLevel2: boolean): string {
  const cells = (r: ReportRow, name: string, role: string, status: string) => [
    name, role, status, r.allocated, r.used, r.l1.signups, r.l1.paying, dollars(r.l1.paidCents),
    ...(withLevel2 ? [r.l2.signups, r.l2.paying, dollars(r.l2.paidCents)] : []),
  ]
  const head = [headers.member, headers.role, headers.status, headers.allocated, headers.used, headers.l1Signups, headers.l1Paying, headers.l1Paid,
    ...(withLevel2 ? [headers.l2Signups, headers.l2Paying, headers.l2Paid] : [])]
  const sum = (pick: (r: ReportRow) => number) => rows.reduce((n, r) => n + pick(r), 0)
  const total: ReportRow = {
    account: totalLabel, role: '', status: '', allocated: sum((r) => r.allocated), used: sum((r) => r.used),
    l1: { signups: sum((r) => r.l1.signups), paying: sum((r) => r.l1.paying), paidCents: sum((r) => r.l1.paidCents) },
    l2: { signups: sum((r) => r.l2.signups), paying: sum((r) => r.l2.paying), paidCents: sum((r) => r.l2.paidCents) },
  }
  return '﻿' + csvLine(head) + rows.map((r) => csvLine(cells(r, r.account, r.role, r.status))).join('') + csvLine(cells(total, total.account, '', ''))
}

export type CustomerRow = {
  member: string
  level: number
  contact: string
  signedUpAt: string
  paidInPeriodCents: number
  paidTotalCents: number
}

export type CustomerHeaders = { member: string; level: string; contact: string; signedUp: string; paidInPeriod: string; paidTotal: string }

export function customerReportCsv(rows: readonly CustomerRow[], headers: CustomerHeaders): string {
  return '﻿' + csvLine([headers.member, headers.level, headers.contact, headers.signedUp, headers.paidInPeriod, headers.paidTotal])
    + rows.map((r) => csvLine([r.member, r.level, r.contact, r.signedUpAt, dollars(r.paidInPeriodCents), dollars(r.paidTotalCents)])).join('')
}
