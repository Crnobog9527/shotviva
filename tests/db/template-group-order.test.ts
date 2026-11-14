import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { expect, it } from 'vitest'
import { connectAdmin, createUser, publishFixture } from './helpers'

async function list(db: Client, active: boolean) {
  const result = await db.query<{ id: string }>(
    "select id from public.templates where id <> 'edit' and is_active=$1 order by sort_order,id", [active])
  return result.rows.map(row => row.id)
}

it('merges independent status-group moves and rejects a stale group membership', async () => {
  const db = await connectAdmin()
  try {
    const actor = await createUser(db)
    await db.query("update public.profiles set role='admin' where id=$1", [actor])
    await db.query('begin')
    await db.query('lock table public.templates in share row exclusive mode')
    const ids = Array.from({ length: 4 }, () => 'group-' + randomUUID())
    await db.query(`insert into public.templates(id,name,category,is_active,credits_cost)
      select id,id,'pets',false,'{"1k":120,"2k":240,"3k":360}'::jsonb from unnest($1::text[]) id`, [ids])
    await publishFixture(db, ...ids.slice(0, 2))

    // Two open editors initially see the same catalogue. The second save must keep the first.
    const active = (await list(db, true)).reverse()
    const inactive = (await list(db, false)).reverse()
    const move = (group: string, order: string[]) =>
      db.query('select public.admin_set_template_order($1,$2,$3)', [group, order, actor])
    await move('inactive', inactive)
    await move('active', active)
    expect(await list(db, false)).toEqual(inactive)
    expect(await list(db, true)).toEqual(active)

    await db.query('update public.templates set is_active=false where id=$1', [ids[0]])
    await db.query('savepoint stale_order')
    await expect(move('active', active)).rejects.toThrow('ORDER_MISMATCH')
    await db.query('rollback to stale_order')
    expect(await list(db, true)).toEqual(active.filter(id => id !== ids[0]))
  } finally {
    await db.query('rollback')
    await db.end()
  }
})
