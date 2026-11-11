import type { PeopleStats } from './people'
import type { GrowthPeriod } from './stats'

// Hand-built samples for the overview's unit tests (not real data).

const slice = { orders: 0, net_usd: 0 }
export const PERIOD: GrowthPeriod = {
  since: '2026-11-04T16:00:00.000Z',
  until: '2026-11-11T08:00:00.000Z',
  signups: 18,
  new_users: { first_image: 11, paid: 2 },
  returning: { active: 4, paid: 1 },
  payers: 3,
  orders: { total: 4, first: 2, repeat: 1, renewal: 1, non_usd: 1 },
  money: { net_usd: 59.8, tax_usd: 0, refunded_usd: 0 },
  by_kind: { first: 29.8, repeat: 0, renewal: 30 },
  by_type: { plan: { orders: 1, net_usd: 30 }, pack: { orders: 3, net_usd: 29.8 } },
  by_channel: { stripe: { orders: 4, net_usd: 59.8 }, waffo: slice },
  refunds: { count: 0, usd: 0 },
  disputes: { count: 0, usd: 0 },
  affiliate: { signups: 0, payers: 0, net_usd: 0 },
  cohort: [],
  cohort_referred: [],
  buyers: [],
}
export const PEOPLE: PeopleStats = { visitors: 320, botViews: 40, uploaded: 14, paywall: 5, checkout: 3 }
