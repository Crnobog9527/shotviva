import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { execute } from './commands'
import { MembershipSwitch } from './member-forms'
import { Select } from './parts'
import type { Member } from './read'

const userId = '6f1c6a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f'
const actor = '0b1c2d3e-4f50-4617-8899-aabbccddeeff'

function fakeDb(error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: null, error }))
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}
function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.set(k, v)
  return data
}

it('suspends with only the status, so slug, parent, team and rate overrides are left as stored', async () => {
  const { db, rpc } = fakeDb()
  const result = await execute(db, actor, form({ operation: 'membership', user_id: userId, status: 'suspended' }))
  expect(result).toBe('membershipSuspended')
  expect(rpc).toHaveBeenCalledWith('admin_affiliate_set', { p_actor: actor, p_input: { user_id: userId, status: 'suspended' } })
})

it('restores an affiliate and refuses any other status through the switch', async () => {
  const { db, rpc } = fakeDb()
  expect(await execute(db, actor, form({ operation: 'membership', user_id: userId, status: 'active' }))).toBe('membershipRestored')
  expect(rpc).toHaveBeenCalledWith('admin_affiliate_set', { p_actor: actor, p_input: { user_id: userId, status: 'active' } })
  await expect(execute(db, actor, form({ operation: 'membership', user_id: userId, status: 'banned' }))).rejects.toThrow()
  expect(rpc).toHaveBeenCalledTimes(1)
})

it('surfaces a database refusal instead of reporting success', async () => {
  const { db } = fakeDb({ message: 'AFFILIATE_NOT_FOUND' })
  await expect(execute(db, actor, form({ operation: 'membership', user_id: userId, status: 'suspended' }))).rejects.toThrow()
})

function render(status: string) {
  const member = { user_id: userId, slug: 'qa-partner', status } as Member
  return renderToStaticMarkup(createElement(MembershipSwitch, { member, action: async () => '' }))
}

it('offers suspension to active affiliates, restoration to suspended ones and nothing otherwise', () => {
  const active = render('active')
  expect(active).toContain('停用联盟资格')
  expect(active).toContain('name="status" value="suspended"')
  expect(active).toContain('未确认的佣金保留')
  const suspended = render('suspended')
  expect(suspended).toContain('恢复联盟资格')
  expect(suspended).toContain('name="status" value="active"')
  expect(render('banned')).toBe('')
  expect(render('pending')).toBe('')
})

it('remounts the status select when the saved status changes, so a form reset cannot restore the old status', () => {
  const select = (initial: string) => {
    const label = Select({ label: '状态', name: 'status', values: ['active', 'suspended', 'banned'], initial }) as ReactElement<{ children: ReactElement[] }>
    return label.props.children.find((child) => child?.type === 'select') as ReactElement<{ defaultValue: string }>
  }
  expect(select('active').key).toBe('active')
  expect(select('suspended').key).toBe('suspended')
  expect(select('suspended').props.defaultValue).toBe('suspended')
})
