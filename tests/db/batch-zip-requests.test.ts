import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { z } from 'zod'

import { applyPurchase, callRpc } from '@/core/billing'
import { downloadBatchZip } from '@/core/jobs'
import { serviceSupabase } from './supabase-env'
import { connectAdmin, createUser, serviceClient } from './helpers'

let sql: Client
beforeAll(async () => { sql = await connectAdmin() })
afterAll(async () => { await sql.end() })

async function account(productId?: 'pro_monthly' | 'max_monthly' | 'starter_monthly') {
  const userId = await createUser(sql)
  if (productId) await applyPurchase(serviceClient(), { userId, productId, eventId: randomUUID() })
  return userId
}

function claim(user: string, batch: string, token = randomUUID()) {
  return callRpc(serviceSupabase(), 'claim_batch_zip', { p_user_id: user, p_batch_id: batch, p_token: token }, z.string())
}

async function release(user: string, batch: string, token: string) {
  await callRpc(serviceSupabase(), 'release_batch_zip', { p_user_id: user, p_batch_id: batch, p_token: token }, z.null())
}

it.each([undefined, 'starter_monthly'] as const)('requires Pro or Max (%s)', async product => {
  await expect(claim(await account(product), randomUUID())).resolves.toBe('upgrade')
})

it.each(['pro_monthly', 'max_monthly'] as const)('admits one concurrent packer and only three requests per minute (%s)', async product => {
  const user = await account(product)
  const batch = randomUUID()
  const requests = await Promise.all(Array.from({ length: 4 }, () => claim(user, batch)))
  expect(requests.sort()).toEqual(['acquired', 'limited', 'packing', 'packing'])
  expect(await claim(user, randomUUID())).toBe('limited')
  expect(await claim(await account(product), batch)).toBe('acquired')
})

it('expires each request separately and prevents an abandoned worker from releasing its successor', async () => {
  const user = await account('pro_monthly')
  const batch = randomUUID()
  const old = randomUUID()
  const next = randomUUID()
  expect(await claim(user, batch, old)).toBe('acquired')
  await sql.query(`update admin.batch_zip_requests set request_times=array[now()-interval '61s', now()-interval '40s', now()-interval '10s'],
    active_batches=jsonb_set(active_batches, array[$2,'expires'], to_jsonb(now()-interval '1s')) where user_id=$1`, [user, batch])
  expect(await claim(user, batch, next)).toBe('acquired')
  expect(await claim(user, randomUUID())).toBe('limited')
  await release(user, batch, old)
  const state = () => sql.query("select active_batches->$2::text->>'token' as token from admin.batch_zip_requests where user_id=$1", [user, batch])
  expect((await state()).rows[0].token).toBe(next)
  await release(user, batch, next)
  expect((await state()).rows[0].token).toBeNull()
})

it('releases a failed download and never upgrades Starter implicitly', async () => {
  const batch = randomUUID()
  const pro = await account('pro_monthly')
  const db = serviceSupabase()
  await expect(downloadBatchZip(db, await account('starter_monthly'), batch)).rejects.toMatchObject({ requiredTier: 'pro' })
  await expect(downloadBatchZip(db, pro, batch)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(await claim(pro, batch)).toBe('acquired')
})
