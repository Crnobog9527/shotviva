import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { shapePvuv } = await import('./collections')

const ready = (rows: { value: string; visitors: number | null; events: number | null }[]) => ({ ready: true, rows })

describe('template collection block (§5.1g)', () => {
  it('takes the two collection events from the goals, signups from share_collection_id, titles from the database', () => {
    const goals = ready([
      { value: 'template_collection_open', visitors: 12, events: 20 },
      { value: 'template_collection_signup_start', visitors: 4, events: 5 },
      { value: 'signup', visitors: 30, events: 30 },
    ])
    const byCollection = ready([{ value: 'a2p138a5lj0w', visitors: 9, events: 15 }, { value: 'not-an-id', visitors: 1, events: 1 }, { value: 'zzzzzzzzzzzz', visitors: 3, events: 3 }])
    const signups = ready([{ value: 'a2p138a5lj0w', visitors: 2, events: 2 }])
    const shaped = shapePvuv(goals, byCollection, signups, new Map([['a2p138a5lj0w', 'Spring menu']]))
    expect(shaped).toEqual({
      status: 'ok', ready: true,
      opens: { visitors: 12, events: 20 }, signupStarts: { visitors: 4, events: 5 }, signups: 2,
      top: [{ id: 'a2p138a5lj0w', title: 'Spring menu', visitors: 9, signups: 2 }, { id: 'zzzzzzzzzzzz', title: null, visitors: 3, signups: 0 }],
    })
  })

  it('reads zero for events not sent yet, unknown when PVUV gives no people, and not ready while it refreshes', () => {
    const shaped = shapePvuv(ready([]), { ready: false, rows: [] }, ready([{ value: 'a2p138a5lj0w', visitors: null, events: 1 }]), new Map())
    expect(shaped).toMatchObject({ ready: false, opens: { visitors: 0, events: 0 }, signups: null, top: [] })
  })
})
