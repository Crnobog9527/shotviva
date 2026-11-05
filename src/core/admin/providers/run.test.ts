import { describe, expect, it } from 'vitest'

import { parseSecretsKey } from '@/core/providers/secrets'

import { runProviderAction } from './run'

describe('runProviderAction', () => {
  it('reports an unset and a malformed PROVIDER_SECRETS_KEY as different reasons', async () => {
    expect(await runProviderAction(async () => parseSecretsKey(undefined))).toEqual({ ok: false, reason: 'secrets_key_missing' })
    expect(await runProviderAction(async () => parseSecretsKey('c2hvcnQ='))).toEqual({ ok: false, reason: 'secrets_key_invalid' })
  })
})
