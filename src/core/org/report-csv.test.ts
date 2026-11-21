import { describe, expect, it } from 'vitest'

import { csvCell, customerReportCsv, memberReportCsv, type MemberHeaders, type ReportRow } from './report-csv'

const headers: MemberHeaders = {
  member: 'Member', role: 'Role', status: 'Status', allocated: 'Given', used: 'Used',
  l1Signups: 'L1 sign-ups', l1Paying: 'L1 paying', l1Paid: 'L1 USD', l2Signups: 'L2 sign-ups', l2Paying: 'L2 paying', l2Paid: 'L2 USD',
}
const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  account: 'ann@acme.test', role: 'Member', status: 'Active', allocated: 500, used: 120,
  l1: { signups: 2, paying: 1, paidCents: 4900 }, l2: { signups: 1, paying: 1, paidCents: 1999 }, ...over,
})
const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean)

describe('csvCell', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx'])('keeps %j from being read as a formula', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`)
  })
  it('quotes and doubles embedded quotes, newlines and commas, and leaves ordinary text and numbers alone', () => {
    expect(csvCell('a "b", c\nd')).toBe('"a ""b"", c\nd"')
    expect(csvCell('j***@example.com')).toBe('"j***@example.com"')
    expect(csvCell(42)).toBe('"42"')
  })
})

describe('memberReportCsv', () => {
  it('writes a BOM, a header, one line per member and a totals line with dollars from cents', () => {
    const csv = memberReportCsv([row(), row({ account: 'bob@acme.test', allocated: 100, used: 0, l1: { signups: 0, paying: 0, paidCents: 0 }, l2: { signups: 0, paying: 0, paidCents: 0 } })], headers, 'Total', true)
    expect(csv.startsWith('﻿')).toBe(true)
    const out = lines(csv)
    expect(out).toHaveLength(4)
    expect(out[0]).toBe('"Member","Role","Status","Given","Used","L1 sign-ups","L1 paying","L1 USD","L2 sign-ups","L2 paying","L2 USD"')
    expect(out[1]).toBe('"ann@acme.test","Member","Active","500","120","2","1","49.00","1","1","19.99"')
    expect(out[3]).toBe('"Total","","","600","120","2","1","49.00","1","1","19.99"')
  })

  it('drops the level-2 columns when the org has no level 2, and never has a commission column', () => {
    const out = lines(memberReportCsv([row()], headers, 'Total', false))
    expect(out[0]?.split('","')).toHaveLength(8)
    expect(out.join('\n')).not.toMatch(/commission|佣金/i)
  })

  it('neutralises a hostile account name', () => {
    const out = lines(memberReportCsv([row({ account: '=HYPERLINK("http://evil","x")' })], headers, 'Total', false))
    expect(out[1]?.startsWith(`"'=HYPERLINK(""http://evil"",""x"")"`)).toBe(true)
  })
})

describe('customerReportCsv', () => {
  it('lists only the masked contact, sign-up time and paid amounts', () => {
    const csv = customerReportCsv(
      [{ member: 'ann@acme.test', level: 1, contact: 'j***@example.com', signedUpAt: '2026-11-03T08:00:00.000Z', paidInPeriodCents: 4900, paidTotalCents: 9800 }],
      { member: 'Member', level: 'Level', contact: 'Customer', signedUp: 'Signed up', paidInPeriod: 'Month USD', paidTotal: 'Total USD' },
    )
    expect(lines(csv)).toEqual([
      '"Member","Level","Customer","Signed up","Month USD","Total USD"',
      '"ann@acme.test","1","j***@example.com","2026-11-03T08:00:00.000Z","49.00","98.00"',
    ])
  })
})
