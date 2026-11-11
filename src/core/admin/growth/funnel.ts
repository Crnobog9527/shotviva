import type { PeopleStats } from './people'
import type { GrowthPeriod } from './stats'

// The consumer funnel the overview draws (ARCHITECTURE §16.2b): visitors, then the people who
// signed up in the period and how far each of them got by its end. Steps are not required to
// happen in order, so a later step can, rarely, hold more people than the one before it (an ad
// blocker can drop the browser's upload event while the server still records the image).

export const NEW_USER_STEPS = ['signup', 'upload', 'image', 'paywall', 'checkout', 'paid'] as const
export type NewUserStep = (typeof NEW_USER_STEPS)[number]

export type StepCount = { key: NewUserStep; count: number | null }

// People counts are null when PostHog could not be read; the database steps always have a value.
export function newUserSteps(db: GrowthPeriod, people: PeopleStats | null): StepCount[] {
  const values: Record<NewUserStep, number | null> = {
    signup: db.signups,
    upload: people?.uploaded ?? null,
    image: db.new_users.first_image,
    paywall: people?.paywall ?? null,
    checkout: people?.checkout ?? null,
    paid: db.new_users.paid,
  }
  return NEW_USER_STEPS.map((key) => ({ key, count: values[key] }))
}

export type Drop = { from: NewUserStep; to: NewUserStep; lost: number }

// The step where the most new users stopped: compared with the closest earlier step that has a
// number, so a missing PostHog step never hides a drop. Null when nobody was lost.
export function biggestDrop(steps: readonly StepCount[]): Drop | null {
  let best: Drop | null = null
  let previous: StepCount | null = null
  for (const step of steps) {
    if (step.count === null) continue
    if (previous && previous.count !== null) {
      const lost = previous.count - step.count
      if (lost > 0 && (!best || lost > best.lost)) best = { from: previous.key, to: step.key, lost }
    }
    previous = step
  }
  return best
}

// Average order in dollars: net revenue over the USD orders it was summed from.
export function averageOrder(db: GrowthPeriod): number | null {
  const usdOrders = db.orders.total - db.orders.non_usd
  return usdOrders > 0 ? db.money.net_usd / usdOrders : null
}
