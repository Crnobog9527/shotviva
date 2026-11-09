import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { createUser } from './helpers'

export async function row(db: Client, sql: string, args: unknown[] = []) {
  return (await db.query(sql, args)).rows[0]
}

export async function promoter(db: Client, parent: string | null = null) {
  const id = await createUser(db)
  const slug = 'qa-' + id.slice(0, 12)
  await db.query("insert into affiliates(user_id,slug,status,parent_user_id) values($1,$2,'active',$3)", [id, slug, parent])
  return { id, slug }
}

export async function bind(db: Client, user: string, slug: string, source = 'signup') {
  return (await row(db, 'select affiliate_bind($1,$2,$3) as bound', [user, slug, source])).bound
}

export async function sale(db: Client, buyer: string, product: string, amount: number, tax = 0) {
  const charge = 'ch_' + randomUUID()
  await db.query("select settle_checkout($1,$2,$3,$4,'usd',$5,'card',null,$6)", [buyer, product, 'cs_t95_' + randomUUID(), amount, tax, charge])
  const { id } = await row(db, 'select id from payments where stripe_charge_id=$1', [charge])
  return { id, charge }
}

export async function commission(db: Client, payment: string, level = 1) {
  return row(db, 'select id,amount::int,status,void_reason,rate_bp,flags from affiliate_commissions where payment_id=$1 and level=$2', [payment, level])
}

export async function available(db: Client, user: string) {
  return (await row(db, 'select available::int from affiliate_balances where affiliate_user_id=$1', [user])).available
}

export async function refund(db: Client, charge: string, amount: number) {
  await db.query("select record_payment_issue($1,'refunded',$2)", [charge, amount])
}

export async function dispute(db: Client, charge: string, amount: number) {
  const id = 'dp_' + randomUUID()
  await db.query("select open_payment_dispute($1,$2,$3,'usd','fraudulent',now(),false)", [id, charge, amount])
  return id
}

export async function setupAffiliate(db: Client) {
  await db.query('update affiliate_settings set enabled=true')
  const actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
  const owner = await promoter(db)
  const buyer = await createUser(db)
  await bind(db, buyer, owner.slug)
  return { actor, owner, buyer }
}
