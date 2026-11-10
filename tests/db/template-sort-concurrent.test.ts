import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'

async function group(db: Client, active: boolean) {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.templates where id <> 'edit' and is_active = $1 order by sort_order, id", [active])
  return rows.map(r => r.id)
}
const swap = (order: string[], a: string, b: string) => order.map(id => id === a ? b : id === b ? a : id)
const move = (db: Client, actor: string, status: string, next: string[], old: string[]) =>
  db.query('select public.admin_set_template_order($1,$2,$3,$4)', [status, next, actor, old])

it('rejects a stale same-group save after the lock is released and accepts an unchanged other group', async () => {
  const first = await connectAdmin(), second = await connectAdmin()
  const ids = Array.from({ length: 4 }, (_, i) => 'concurrent-' + i + '-' + randomUUID().slice(0, 8))
  const actor = await createUser(first)
  try {
    await first.query("update public.profiles set role = 'admin' where id = $1", [actor])
    await first.query(`insert into public.templates(id, name, category, is_active, sort_order)
      select id, id, 'pets', false, 700000 + pos * 10 from unnest($1::text[]) with ordinality s(id, pos)`, [ids])
    const old = await group(first, false), active = await group(second, true)
    const next = swap(old, ids[0]!, ids[1]!), stale = swap(old, ids[2]!, ids[3]!)
    const pid = (await second.query('select pg_backend_pid() as id')).rows[0].id
    await first.query('begin')
    await move(first, actor, 'inactive', next, old)
    const waiter = move(second, actor, 'inactive', stale, old).then(() => 'saved', (error: Error) => error.message)
    await expect.poll(async () => (await first.query(
      'select pg_backend_pid() = any(pg_blocking_pids($1)) as waiting', [pid])).rows[0].waiting).toBe(true)
    await first.query('commit')
    expect(await waiter).toBe('ORDER_MISMATCH')
    expect(await group(second, false)).toEqual(next)
    await move(second, actor, 'active', active, active)
    expect(await group(second, true)).toEqual(active)
  } finally {
    await first.query('rollback')
    await first.query('delete from public.templates where id = any($1)', [ids])
    await first.query('delete from auth.users where id = $1', [actor])
    await Promise.all([first.end(), second.end()])
  }
})
