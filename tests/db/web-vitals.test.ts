import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { connectAdmin } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Migration 2000: anonymous web-vitals rows, written by /api/vitals with the service role only.
const api = serviceSupabase()
const ids: number[] = []
let db: Client

const row = {
  metric: 'LCP',
  value: 1234,
  rating: 'needs-improvement',
  route: 'generate',
  locale: 'zh',
  nav_type: 'navigate',
  standalone: true,
  sw: false,
  effective_type: '4g',
  country: 'CN',
}

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  if (db) {
    await db.query('delete from web_vitals where id=any($1::bigint[])', [ids])
    await db.end()
  }
})

it('takes a checked row from the service role', async () => {
  const { data, error } = await api.from('web_vitals').insert(row).select('id, created_at').single()
  expect(error).toBeNull()
  ids.push(data!.id)
  // The receive time, cut to the hour (UTC).
  const created = new Date(data!.created_at)
  const hour = new Date()
  hour.setUTCMinutes(0, 0, 0)
  expect([hour.getTime(), hour.getTime() - 3_600_000]).toContain(created.getTime())
  const cls = await api.from('web_vitals').insert({ ...row, metric: 'CLS', value: 0.0123, effective_type: null, country: null }).select('id').single()
  expect(cls.error).toBeNull()
  ids.push(cls.data!.id)
})

it('2002: says whether the app shell answered the page, false when not given', async () => {
  const given = await api.from('web_vitals').insert({ ...row, shell: true }).select('id, shell').single()
  expect(given.error).toBeNull()
  expect(given.data!.shell).toBe(true)
  ids.push(given.data!.id)
  const older = await api.from('web_vitals').insert(row).select('id, shell').single()
  expect(older.data!.shell).toBe(false)
  ids.push(older.data!.id)
})

it('is closed to clients: no read, no write for anon or authenticated', async () => {
  const grants = await db.query(`select r, has_table_privilege(r::name,'public.web_vitals','select') sel,
    has_table_privilege(r::name,'public.web_vitals','insert') ins from unnest(array['anon','authenticated']) r`)
  expect(grants.rows.map((g) => [g.sel, g.ins])).toEqual([
    [false, false],
    [false, false],
  ])
  expect((await anonSupabase().from('web_vitals').insert(row)).error).not.toBeNull()
  const read = await db.query("select relrowsecurity from pg_class where oid='public.web_vitals'::regclass")
  expect(read.rows[0].relrowsecurity).toBe(true)
})

it.each([
  { metric: 'FID' },
  { value: -1 },
  { value: 120_001 },
  { metric: 'CLS', value: 101 },
  { rating: 'bad' },
  { route: 'admin' },
  { route: 'photos/123' },
  { locale: 'fr' },
  { nav_type: 'soft-navigation' },
  { effective_type: '5g' },
  { country: 'cn' },
  { country: 'USA' },
  { created_at: '2026-11-24T10:15:00Z' },
  { created_at: '2026-11-24T10:00:00.5Z' },
])('rejects an out-of-range row %o', async (change) => {
  const { error } = await api.from('web_vitals').insert({ ...row, ...change })
  expect(error?.code).toBe('23514')
})
