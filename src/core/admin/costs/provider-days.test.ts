import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { providerDaysSchema, splitByProvider, windowDays } = await import('./provider-days')
const { reconcile } = await import('./reconcile')

const row = (day: string, provider: string, extra: Record<string, number> = {}) => ({
  day, provider, cost_usd: 0, cost_cny: 0, costed: 0, uncosted: 0, no_usage: 0, test_cost_usd: 0, test_cost_cny: 0, test_runs: 0, ...extra,
})

describe('splitByProvider', () => {
  const days = windowDays(3, Date.parse('2026-11-13T05:00:00Z'))

  it('gives every provider every UTC day of the window, oldest first, ending today', () => {
    expect(days).toEqual(['2026-11-11', '2026-11-12', '2026-11-13'])
    const split = splitByProvider(providerDaysSchema.parse([row('2026-11-12', 'openai', { cost_usd: 1, costed: 2 })]), days)
    expect(split.openai.map((d) => d.cost_usd)).toEqual([0, 1, 0])
    expect(split.openrouter).toHaveLength(3)
    expect(split.ark.every((d) => d.cost_usd === 0 && d.costed === 0)).toBe(true)
  })

  it('adds test runs into ours and keeps them apart, in USD and (Ark) CNY', () => {
    const rows = providerDaysSchema.parse([
      row('2026-11-13', 'ark', { cost_usd: 0.2, cost_cny: 1.3, costed: 10, test_cost_usd: 0.05, test_cost_cny: 0.33, test_runs: 2 }),
      row('2026-11-13', 'openrouter', { cost_usd: 0.4, costed: 4, uncosted: 1 }),
    ])
    const { ark, openrouter, openai } = splitByProvider(rows, days)
    expect(ark[2]).toMatchObject({ cost_usd: 0.25, test_cost_usd: 0.05, test_runs: 2, costed: 10 })
    expect(ark[2]?.cost_cny).toBeCloseTo(1.63)
    expect(openrouter[2]).toMatchObject({ cost_usd: 0.4, costed: 4, uncosted: 1 })
    expect(openai[2]?.cost_usd).toBe(0)
  })

  it('refuses a provider the page does not know', () => {
    expect(() => providerDaysSchema.parse([row('2026-11-13', 'gemini')])).toThrow()
  })
})

describe('reconcile per provider', () => {
  const days = windowDays(3, Date.parse('2026-11-13T05:00:00Z'))
  const rows = providerDaysSchema.parse([
    row('2026-11-11', 'openrouter', { cost_usd: 1, costed: 3 }),
    row('2026-11-12', 'openrouter', { cost_usd: 2, costed: 5 }),
    row('2026-11-13', 'openrouter', { cost_usd: 0.5, costed: 1 }),
  ])

  it('OpenRouter: today is not billed yet, so it has no billed figure and stays out of the difference', () => {
    const { openrouter } = splitByProvider(rows, days)
    const { rows: out, totals } = reconcile(openrouter, { '2026-11-11': 1.1, '2026-11-12': 2 }, { pendingToday: true })
    expect(out[0]).toMatchObject({ day: '2026-11-13', billed: null, difference: null })
    expect(out[1]).toMatchObject({ billed: 2, difference: 0 })
    expect(totals).toMatchObject({ ours: 3.5, billed: 3.1, jobs: 9 })
    expect(totals.difference).toBeCloseTo(0.1)
  })

  it('Ark: no bill, our USD and CNY totals only', () => {
    const ark = splitByProvider(providerDaysSchema.parse([row('2026-11-12', 'ark', { cost_usd: 0.1, cost_cny: 0.65, costed: 5 })]), days).ark
    const { totals } = reconcile(ark, null)
    expect(totals).toMatchObject({ ours: 0.1, oursCny: 0.65, billed: null, difference: null, jobs: 5 })
  })
})
