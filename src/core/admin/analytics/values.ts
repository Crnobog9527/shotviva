import { z } from 'zod'

// How PostHog's JSON carries ClickHouse values: counts as numbers (big ones sometimes as strings),
// an average over no rows as null (ClickHouse nan), booleans as 0 / 1.

const toNumber = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value)

export const count = z.preprocess(toNumber, z.number().int().nonnegative())

export const maybe = z.preprocess((value) => {
  const n = toNumber(value)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}, z.number().nullable())

export const flag = z.preprocess((value) => value === 1 || value === true || value === '1', z.boolean())

export const label = z.preprocess((value) => (value === null || value === undefined ? '' : String(value)), z.string())

// a / b, or null when there is nothing to divide by.
export const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null)

// The change against the previous period, or null when there was nothing before.
export const change = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null || previous === 0 ? null : (current - previous) / previous
