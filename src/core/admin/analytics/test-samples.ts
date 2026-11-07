import { readFileSync } from 'node:fs'

import type { HogQL, QueryAnswer, RunQuery } from './posthog-query'
import { windowFor } from './range'

// Test helper. samples/*.json are full Query API answers in the shape PostHog returns for a
// HogQLQuery (columns, types, results, cache fields), one per query name. They were written
// from the documented format before the read-only key existed; replace them with recorded
// answers (same file names) once the key is in.

export function sample(name: string): QueryAnswer {
  return JSON.parse(readFileSync(new URL(`./samples/${name}.json`, import.meta.url), 'utf8')) as QueryAnswer
}

// Answers each query from samples/<query name>.json (or an override) and records what was asked.
export function fakeRun(overrides: Record<string, QueryAnswer> = {}): RunQuery & { asked: HogQL[] } {
  const asked: HogQL[] = []
  const run = async (query: HogQL) => {
    asked.push(query)
    return overrides[query.name] ?? sample(query.name)
  }
  return Object.assign(run, { asked })
}

// Saturday 2026-11-07 16:30 Beijing.
export const NOW = new Date('2026-11-07T08:30:00Z')
export const WEEK = windowFor('7d', NOW)
export const TODAY = windowFor('today', NOW)
