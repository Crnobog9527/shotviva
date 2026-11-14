import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Client } from 'pg'

import { benefits, invite, seededRewards } from '../t94-config'

import { previewCode, readPendingDiscount, redeemCode } from '@/core/codes/server'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

let db: Client
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

it('previews and redeems the configured invite grant through PostgREST', async () => {
  const admin = serviceSupabase()
  const owner = await createUser(db)
  const user = await createUser(db)
  const { rows: [row] } = await db.query('select public.get_or_create_invite_code($1) as code',[owner])
  expect(await previewCode(admin,row.code)).toMatchObject({kind:'invite',credits:seededRewards.inviteeCredits,pool:'free'})
  await db.query("select public.grant_credits($1,$3,'signup',$2,'free')",[user,'signup:'+user,benefits.freeCredits])
  expect(await redeemCode(admin,{userId:user, code:row.code, context:'signup',invite,locale:'en'})).toMatchObject({status:'ok',credits:seededRewards.inviteeCredits})
  await db.query('update profiles set banned_at=now() where id=$1',[owner])
  expect(await previewCode(admin,row.code)).toBeNull()
})

it('shows only the current user’s eligible discount and its effective expiry', async () => {
  const admin=serviceSupabase()
  const user=await createUser(db)
  const code=randomUUID().replaceAll('-','').slice(0,12).toUpperCase()
  await db.query(`insert into public.codes (code,kind,discount_percent,discount_products,discount_duration,stripe_coupon_id,discount_valid_days)
    values ($1,'campaign',20,'{pack_s}','once','test',3)`,[code])
  expect(await previewCode(admin,code)).toMatchObject({kind:'campaign',percent:20,products:['pack_s']})
  expect(await readPendingDiscount(admin,user)).toBeNull()
  expect(await redeemCode(admin,{userId:user,code,context:'account',invite,locale:'zh'})).toMatchObject({status:'ok'})
  expect(await readPendingDiscount(admin,user)).toMatchObject({code,percent:20,expiresAt:expect.any(String)})
  expect(await readPendingDiscount(admin,await createUser(db))).toBeNull()
  await db.query('update codes set active=false where code=$1',[code])
  expect(await readPendingDiscount(admin,user)).toBeNull()
})
