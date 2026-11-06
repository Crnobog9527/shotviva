import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { activateProvider, saveProvider } from '@/core/admin'
import { activeCredentials, loadActiveProviderRow, readProviderKey, ProviderSettingError } from '@/core/providers'

import { connectAdmin, createUser } from './helpers'
import { publicHost } from './provider-fixtures'
import { serviceSupabase } from './supabase-env'

// T30: the 'decision' module (ARCHITECTURE §3.3, §5.2) sits beside 'image' in ai_providers. It
// runs only the openai_responses adapter and has its own active row. The only file that switches
// decision rows, so it can run beside ai-providers.test.ts (which switches image rows).

const PREFIX = 'T30 decision'
const KEY = 'sk-t30-decision-secret-0123456789'

let pg: Client
let adminId: string

const deps = () => ({ db: serviceSupabase(), resolveHost: publicHost })
const save = (input: Record<string, unknown>) =>
  saveProvider(deps(), adminId, {
    label: `${PREFIX} ${randomUUID().slice(0, 6)}`,
    module: 'decision',
    adapter: 'openai_responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6-luna',
    apiKey: KEY,
    ...input,
  })

beforeAll(async () => {
  pg = await connectAdmin()
  adminId = await createUser(pg)
})

afterAll(async () => {
  await pg.query('delete from public.ai_providers where label like $1', [`${PREFIX}%`])
  await pg.end()
})

describe('decision providers', () => {
  it('saves a decision row with its key in Vault', async () => {
    const id = await save({})
    expect(await readProviderKey(serviceSupabase(), id)).toBe(KEY)
  })

  it('refuses a module with the other module adapter, in the admin command and in the table', async () => {
    await expect(save({ adapter: 'openai_images' })).rejects.toBeInstanceOf(ProviderSettingError)
    await expect(
      pg.query(
        `insert into public.ai_providers (module, adapter, label, model) values ('decision', 'openai_images', $1, 'gpt-6-luna')`,
        [`${PREFIX} bad`],
      ),
    ).rejects.toThrow(/ai_providers_module_adapter/)
  })

  it('switches the decision row without touching the image row', async () => {
    const imageBefore = await loadActiveProviderRow(serviceSupabase(), 'image')
    const first = await save({})
    const second = await save({})
    await activateProvider(deps(), adminId, { id: first })
    await activateProvider(deps(), adminId, { id: second })
    expect((await loadActiveProviderRow(serviceSupabase(), 'decision'))?.id).toBe(second)
    expect((await loadActiveProviderRow(serviceSupabase(), 'image'))?.id).toBe(imageBefore?.id)

    const credentials = await activeCredentials(
      'decision',
      (module) => loadActiveProviderRow(serviceSupabase(), module),
      (id) => readProviderKey(serviceSupabase(), id),
    )
    expect(credentials).toMatchObject({ tag: `${second}/gpt-6-luna`, adapter: 'openai_responses', config: { apiKey: KEY } })
    // No prices on the row: gpt-6-luna's official input / output prices apply (§10.0).
    expect(credentials?.prices).toEqual({ inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 })
  })
})
