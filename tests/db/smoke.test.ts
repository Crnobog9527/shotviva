import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL } from './supabase-env'

describe('local supabase database', () => {
  const client = new Client({ connectionString: DB_URL })

  beforeAll(async () => {
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  it('accepts connections and runs a query', async () => {
    const { rows } = await client.query<{ ok: number }>('select 1 as ok')
    expect(rows[0]?.ok).toBe(1)
  })

  it('has the auth schema that later migrations build on', async () => {
    const { rows } = await client.query<{ exists: boolean }>(
      "select exists(select 1 from information_schema.schemata where schema_name = 'auth') as exists",
    )
    expect(rows[0]?.exists).toBe(true)
  })
})
