import type { Client } from 'pg'

// Synthetic policy scoped to the test transaction.
export async function seedCatalogPolicy(db: Client) {
  const policy = { payment_bp: 850, refund_bp: 250, yearly_commission_bp: 1301, other_commission_bp: 2001, margin_bp: 5000 }
  await db.query(`insert into public.system_settings(key,value) values('catalog_economics_policy',$1::jsonb)
    on conflict(key) do update set value=excluded.value`, [JSON.stringify(policy)])
}
