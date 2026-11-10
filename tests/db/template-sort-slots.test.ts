import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'

let db: Client
let actor: string

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query('lock table public.templates in share row exclusive mode')
  actor = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [actor])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function fixtures(slots: number[]) {
  const prefix = 'sort-' + randomUUID().slice(0, 8)
  const ids = slots.map((_, i) => prefix + '-' + i)
  await db.query(`insert into public.templates(id, name, category, is_active, sort_order)
    select id, id, 'pets', false, slot from unnest($1::text[],$2::integer[]) s(id, slot)`, [ids, slots])
  return ids
}
async function ranks() {
  const result = await db.query<{ id: string; sort_order: number }>('select id, sort_order from public.templates')
  return Object.fromEntries(result.rows.map(row => [row.id, row.sort_order]))
}
async function members(group: string) {
  const result = await db.query<{ id: string }>(
    "select id from public.templates where id <> 'edit' and ($1 = 'catalogue' or not is_active) order by sort_order, id", [group])
  return result.rows.map(row => row.id)
}
const exchange = (order: string[], a: string, b: string) => order.map(id => id === a ? b : id === b ? a : id)
const save = (group: string, ids: string[], expected: string[]) =>
  db.query('select public.admin_set_template_order($1,$2,$3,$4)', [group, ids, actor, expected])

it.each(['inactive', 'catalogue'])('reuses two nonuniform slots in %s and preserves every other stored integer', async group => {
  const [a, b] = await fixtures([900003, 901532]) as [string, string]
  const old = await members(group), next = exchange(old, a, b), before = await ranks()
  await save(group, next, old)
  expect(await members(group)).toEqual(next)
  expect(await ranks()).toEqual({ ...before, [a]: before[b], [b]: before[a] })
  await save(group, old, next)
  expect(await ranks()).toEqual(before)
})

it.each([-2147483648, 2147483647])('moves tied rows near integer boundary %i without disturbing their neighbours', async slot => {
  const [a, b] = await fixtures([slot, slot]) as [string, string]
  const old = await members('inactive'), next = exchange(old, a, b), before = await ranks()
  await save('inactive', next, old)
  expect(await members('inactive')).toEqual(next)
  const after = await ranks()
  expect({ ...after, [a]:before[a], [b]:before[b] }).toEqual(before)
})

it('rejects an unrepresentable order between two same-number anchors without changing any row', async () => {
  const ids = await fixtures([800000, 800000, 800000, 800000])
  const old = await members('inactive'), next = exchange(old, ids[1]!, ids[2]!), before = await ranks()
  await db.query('savepoint before_move')
  await expect(save('inactive', next, old)).rejects.toThrow('ORDER_TIED')
  await db.query('rollback to before_move')
  expect(await ranks()).toEqual(before)
})
