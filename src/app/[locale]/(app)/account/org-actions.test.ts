import { beforeEach, describe, expect, it, vi } from 'vitest'

const spies = vi.hoisted(() => ({ user: vi.fn(), db: vi.fn(), command: vi.fn(), refresh: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: spies.db, requireUser: spies.user }))
vi.mock('next/cache', () => ({ refresh: spies.refresh }))
vi.mock('@/core/org/console', () => ({
  orgCommands: {
    deposit: spies.command, allocate: spies.command, setAllowance: spies.command, removeMember: spies.command,
    resetInvite: spies.command, leave: spies.command, join: spies.command,
  },
}))

const actions = await import('./org-actions')

const USER = '00000000-0000-4000-8000-0000000000a1'
const signedOut = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' })
const calls = [
  () => actions.depositAction({}),
  () => actions.allocateAction({}),
  () => actions.setAllowanceAction({}),
  () => actions.removeMemberAction({}),
  () => actions.resetInviteAction(),
  () => actions.leaveOrgAction({}),
  () => actions.joinOrgAction('a'.repeat(32)),
]

describe('enterprise server actions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('send a signed-out caller to login before creating a database client or running anything', async () => {
    spies.user.mockRejectedValue(signedOut)
    for (const call of calls) await expect(call()).rejects.toBe(signedOut)
    expect(spies.db).not.toHaveBeenCalled()
    expect(spies.command).not.toHaveBeenCalled()
  })

  it('hand the command the session account, never an id from the arguments', async () => {
    spies.user.mockResolvedValue({ id: USER })
    spies.db.mockReturnValue('db')
    spies.command.mockResolvedValue({ ok: true })
    await actions.allocateAction({ requestId: 'r-1234567', member: 'x', credits: 1, user: 'attacker', owner: 'attacker' })
    expect(spies.command).toHaveBeenCalledWith({ db: 'db', user: USER }, expect.objectContaining({ user: 'attacker' }))
    expect(spies.command.mock.calls[0]?.[0]).toEqual({ db: 'db', user: USER })
  })

  it('refresh the page when the action applied, or when the pool was short (its number was stale)', async () => {
    spies.user.mockResolvedValue({ id: USER })
    spies.command.mockResolvedValueOnce({ ok: false, error: 'CREDITS_INSUFFICIENT' })
    await actions.depositAction({})
    expect(spies.refresh).not.toHaveBeenCalled()
    spies.command.mockResolvedValueOnce({ ok: true, pool: 1 })
    await actions.depositAction({})
    expect(spies.refresh).toHaveBeenCalledTimes(1)
    spies.command.mockResolvedValueOnce({ ok: false, error: 'POOL_INSUFFICIENT' })
    await actions.depositAction({})
    expect(spies.refresh).toHaveBeenCalledTimes(2)
  })

  it('join binds the token it was given and sends login back to the join page', async () => {
    spies.user.mockResolvedValue({ id: USER })
    spies.command.mockResolvedValue({ ok: true })
    await actions.joinOrgAction('c'.repeat(32))
    expect(spies.user).toHaveBeenCalledWith(`/join/org/${'c'.repeat(32)}`)
    expect(spies.command).toHaveBeenCalledWith(expect.objectContaining({ user: USER }), 'c'.repeat(32))
  })
})
