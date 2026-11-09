import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createAffiliate } from '@/core/affiliate/admin/create'
import { COPY } from '@/core/affiliate/admin/copy'
import { categories } from '@/core/affiliate/admin/query'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

let db: Client
let actor: string
const users: string[] = []
const rest = serviceSupabase()

async function account() {
  const id = await createUser(db)
  users.push(id)
  return id
}
beforeAll(async () => {
  db = await connectAdmin()
  actor = await account()
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterAll(async () => {
  await db.query('delete from auth.users where id=any($1::uuid[])', [users])
  await db.end()
})

function form(input: Record<string, string>) {
  const fields = new FormData()
  for (const kind of categories) {
    fields.set(kind + '_l1', '')
    fields.set(kind + '_l2', '')
  }
  for (const [key, value] of Object.entries(input)) fields.set(key, value)
  return fields
}

it('concurrent retries keep exactly one set of rates and one audit; a competing user gets a fresh slug', async () => {
  const id = await account()
  const other = await account()
  const slug = 'qa-' + randomUUID().slice(0, 8)
  const save = (user: string, rate: string) => createAffiliate(rest, actor, form({ user_id: user, slug, pack_l1: rate }))
  const [a, b, c] = await Promise.all([save(id, '12'), save(id, '13'), save(other, '14')])
  expect(a.member.slug).toBe(b.member.slug)
  expect(a.existing).not.toBe(b.existing)
  expect(c.member.slug).not.toBe(a.member.slug)
  const rows = await db.query("select user_id,slug,l1_bp from affiliates join affiliate_rate_overrides using(user_id) where user_id=any($1::uuid[]) and product_kind='pack'", [[id, other]])
  expect(rows.rows).toEqual(expect.arrayContaining([
    { user_id: id, slug: a.member.slug, l1_bp: a.existing ? 1300 : 1200 },
    { user_id: other, slug: c.member.slug, l1_bp: 1400 },
  ]))
  const audit = await db.query("select count(*)::int as n from admin_audit_log where action='affiliate_create' and target_id=$1", [id])
  expect(audit.rows[0].n).toBe(1)
})

it('a substring or digit in an email never selects a phone account; explicit country code disambiguates', async () => {
  const cn = await account()
  const us = await account()
  const national = '1415' + String(crypto.getRandomValues(new Uint32Array(1))[0]).padStart(10, '0').slice(-7)
  for (const [id, number] of [[cn, '86' + national], [us, national]]) {
    await db.query("update auth.users set email=null, phone=$2 where id=$1", [id, number])
  }
  const save = (input: string) => createAffiliate(rest, actor, form({ account: input }))
  await expect(save(national)).rejects.toThrow(COPY.phoneAmbiguous)
  await expect(save('+' + national.slice(1))).rejects.toThrow(COPY.phoneMissing)
  await db.query('update auth.users set email=$2 where id=$1', [actor, '+442079460000@example.test'])
  await expect(save('+442079460000')).rejects.toThrow(COPY.phoneMissing)
  const { member } = await save('0086 ' + national)
  const result = await db.query('select user_id from affiliates where slug=$1', [member.slug])
  expect(result.rows).toEqual([{ user_id: cn }])
})

it.each(['active', 'pending', 'suspended', 'rejected', 'banned'])('replays return the existing %s enrollment without modifying it', async (status) => {
  const user = await account()
  const slug = 'qa-' + randomUUID().slice(0, 8)
  await db.query('insert into affiliates(user_id,slug,status) values($1,$2,$3)', [user, slug, status])
  const result = await createAffiliate(rest, actor, form({ user_id: user, slug: 'unused-slug', pack_l1: '12' }))
  expect(result).toMatchObject({ existing: true, member: { slug, status } })
  expect((await db.query('select 1 from affiliate_rate_overrides where user_id=$1', [user])).rowCount).toBe(0)
})
