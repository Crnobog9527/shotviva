import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { actOnExperiment, loadExperimentViews, saveExperiment } from '@/core/admin'
import { liveExperimentSchema } from '@/core/experiments'
import { experimentRegistry } from '@/site/experiments'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// A/B experiments (ARCHITECTURE §16.5, migrations 1540–1545) through the commands the admin page,
// the proxy and the sign-in call.

let db: Client
let admin: string
const service = serviceSupabase()

const draft = (patch: Record<string, unknown> = {}) => ({
  id: null,
  surface: 'hero',
  name: '首屏 画风 vs 电商',
  goal: 'signup',
  variants: [
    { optionId: 'tote', label: '电商', weight: 50, isControl: true },
    { optionId: 'art-style', label: '画风', weight: 50, isControl: false },
  ],
  ...patch,
})

const variantsOf = async (id: number) =>
  (await db.query<{ id: string; option_id: string }>('select id, option_id from public.experiment_variants where experiment_id = $1 order by id', [id])).rows.map((row) => ({ id: Number(row.id), option: row.option_id }))

const live = async () => {
  const { data, error } = await service.rpc('experiments_live')
  expect(error).toBeNull()
  return liveExperimentSchema.array().parse(data)
}

const signIn = async (user: string, pairs: { experiment: number; current: number; first: number }[], signup: boolean) => {
  const { data, error } = await service.rpc('experiment_sign_in', { p_user: user, p_pairs: pairs, p_signup: signup })
  expect(error).toBeNull()
  return data as { experiment: number; current: number; first: number }[]
}

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
})

// One live experiment per surface: every test starts with the hero free.
beforeEach(async () => {
  await db.query("update public.experiments set status = 'ended', ended_at = now() where status in ('running', 'paused')")
})

afterAll(async () => {
  await db.end()
})

describe('experiments access', () => {
  it('refuses every client role', async () => {
    for (const table of ['experiments', 'experiment_variants', 'experiment_assignments']) {
      const { data } = await anonSupabase().from(table).select('*')
      expect(data ?? []).toEqual([])
    }
    const { error } = await anonSupabase().rpc('experiments_live')
    expect(error).not.toBeNull()
  })

  it('refuses a non-admin actor and options the code does not have', async () => {
    const user = await createUser(db)
    await expect(saveExperiment(service, user, draft(), experimentRegistry)).rejects.toThrow()
    await expect(saveExperiment(service, admin, draft({ variants: [{ optionId: 'tote', label: 'a', weight: 1, isControl: true }, { optionId: 'nope', label: 'b', weight: 1, isControl: false }] }), experimentRegistry)).rejects.toThrow(/代码里没有/)
  })
})

describe('experiment lifecycle', () => {
  it('drafts are invisible to the proxy until started; then the surface is live with its variants', async () => {
    const id = await saveExperiment(service, admin, draft(), experimentRegistry)
    expect((await live()).some((row) => row.id === id)).toBe(false)
    await actOnExperiment(service, admin, { id, action: 'start' })
    const row = (await live()).find((candidate) => candidate.id === id)
    expect(row?.status).toBe('running')
    expect(row?.variants.map((variant) => [variant.option, variant.control])).toEqual([['tote', true], ['art-style', false]])
    await expect(saveExperiment(service, admin, draft({ id }), experimentRegistry)).rejects.toThrow(/不能再改/)
  })

  it('allows one live experiment per surface', async () => {
    const first = await saveExperiment(service, admin, draft(), experimentRegistry)
    const second = await saveExperiment(service, admin, draft(), experimentRegistry)
    await actOnExperiment(service, admin, { id: first, action: 'start' })
    await expect(actOnExperiment(service, admin, { id: second, action: 'start' })).rejects.toThrow(/已经有一个/)
  })

  it('stores the browser’s assignment at sign-up and lets the account win on another device', async () => {
    const id = await saveExperiment(service, admin, draft(), experimentRegistry)
    await actOnExperiment(service, admin, { id, action: 'start' })
    const [control, art] = await variantsOf(id)
    const user = await createUser(db)
    expect(await signIn(user, [{ experiment: id, current: art!.id, first: art!.id }], true)).toEqual([{ experiment: id, current: art!.id, first: art!.id }])
    // Another device holding the control: the account's row stays.
    expect(await signIn(user, [{ experiment: id, current: control!.id, first: control!.id }], false)).toEqual([{ experiment: id, current: art!.id, first: art!.id }])
    // A variant of another experiment is ignored.
    const other = await createUser(db)
    expect(await signIn(other, [{ experiment: id, current: 999999, first: 999999 }], true)).toEqual([])
  })

  it('archiving moves the accounts on a variant to the fallback and records it; results stay on the first variant', async () => {
    const id = await saveExperiment(service, admin, draft(), experimentRegistry)
    await actOnExperiment(service, admin, { id, action: 'start' })
    const [control, art] = await variantsOf(id)
    const user = await createUser(db)
    await signIn(user, [{ experiment: id, current: art!.id, first: art!.id }], true)
    await expect(actOnExperiment(service, admin, { id, action: 'archive', variant: control!.id })).rejects.toThrow(/对照组不能归档/)
    await actOnExperiment(service, admin, { id, action: 'archive', variant: art!.id })
    const moved = await db.query('select current_variant_id, first_variant_id, reassigned_from from public.experiment_assignments where experiment_id = $1 and user_id = $2', [id, user])
    expect(moved.rows[0]).toMatchObject({ current_variant_id: String(control!.id), first_variant_id: String(art!.id), reassigned_from: String(art!.id) })
    const { data } = await service.rpc('admin_experiment_results', { p_id: id })
    const rows = data as { variant_id: number; signups: number; now_on: number; moved: number }[]
    expect(rows.find((row) => row.variant_id === art!.id)).toMatchObject({ signups: 1, now_on: 0, moved: 1 })
    expect(rows.find((row) => row.variant_id === control!.id)).toMatchObject({ signups: 0, now_on: 1 })
    // A variant with people on it can never be deleted.
    await expect(db.query('delete from public.experiment_variants where id = $1', [art!.id])).rejects.toThrow(/foreign key/)
  })

  it('counts sign-ups of the variant first seen and leaves admin accounts out', async () => {
    const id = await saveExperiment(service, admin, draft({ goal: 'payment' }), experimentRegistry)
    await actOnExperiment(service, admin, { id, action: 'start' })
    const [, art] = await variantsOf(id)
    const user = await createUser(db)
    await signIn(user, [{ experiment: id, current: art!.id, first: art!.id }], true)
    await signIn(admin, [{ experiment: id, current: art!.id, first: art!.id }], true)
    const { data } = await service.rpc('admin_experiment_results', { p_id: id })
    const row = (data as { variant_id: number; signups: number; payments: number }[]).find((candidate) => candidate.variant_id === art!.id)
    expect(row).toMatchObject({ signups: 1, payments: 0 })
  })

  it('pause, resume and end change what the proxy reads; ending names the winner', async () => {
    const id = await saveExperiment(service, admin, draft(), experimentRegistry)
    await actOnExperiment(service, admin, { id, action: 'start' })
    await actOnExperiment(service, admin, { id, action: 'pause' })
    expect((await live()).find((row) => row.id === id)?.status).toBe('paused')
    await actOnExperiment(service, admin, { id, action: 'resume' })
    const [, art] = await variantsOf(id)
    await actOnExperiment(service, admin, { id, action: 'end', variant: art!.id })
    const row = (await live()).find((candidate) => candidate.surface === 'hero')
    expect(row).toMatchObject({ id, status: 'ended', winner: art!.id })
    await expect(actOnExperiment(service, admin, { id, action: 'start' })).rejects.toThrow(/状态已经变了/)
  })

  it('deletes drafts only, and writes every change to the audit log', async () => {
    const id = await saveExperiment(service, admin, draft(), experimentRegistry)
    await actOnExperiment(service, admin, { id, action: 'delete' })
    expect((await db.query('select 1 from public.experiments where id = $1', [id])).rowCount).toBe(0)
    const audit = await db.query("select action from public.admin_audit_log where target_id = $1 and user_id = $2 order by id", [String(id), admin])
    expect(audit.rows.map((row) => row.action)).toEqual(['experiment_save', 'experiment_delete'])
  })

  it('loads the admin page views with database results even without PostHog', async () => {
    const id = await saveExperiment(service, admin, draft(), experimentRegistry)
    await actOnExperiment(service, admin, { id, action: 'start' })
    const view = (await loadExperimentViews(service, false)).find((candidate) => candidate.row.id === id)
    expect(view?.results?.map((row) => row.signups)).toEqual([0, 0])
    expect(view?.verdict?.kind).toBe('no_visitors')
  })
})
