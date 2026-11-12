import { expect, it } from 'vitest'

import { assertTestOnlyToken, PRODUCTION_BUCKET, targetStores } from './batch-file'

const failing = (status?: number) => ({ send: async () => { throw Object.assign(new Error('x'), status ? { $metadata: { httpStatusCode: status } } : {}) } })

it('refuses a token that can reach the production bucket, and one it cannot check', async () => {
  const seen: unknown[] = []
  await expect(assertTestOnlyToken({ send: async (command) => { seen.push(command.input); return {} } })).rejects.toThrow(PRODUCTION_BUCKET)
  expect(seen).toEqual([{ Bucket: PRODUCTION_BUCKET }])
  await expect(assertTestOnlyToken(failing())).rejects.toThrow('连不上 R2')
  await expect(assertTestOnlyToken(failing(500))).rejects.toThrow('连不上 R2')
})

it('accepts a token the production bucket refuses or does not know', async () => {
  await expect(assertTestOnlyToken(failing(403))).resolves.toBe(403)
  await expect(assertTestOnlyToken(failing(404))).resolves.toBe(404)
})

it('opens no buckets without the tool\'s own keys or on a local stack', async () => {
  const preview = { name: 'preview' as const, storage: { privateBucket: 'p', publicBucket: 'q', assetsBase: 'https://a' }, assetsBase: 'https://a', site: null }
  expect(await targetStores(preview, { R2_ACCESS_KEY_ID: 'shell', R2_SECRET_ACCESS_KEY: 'shell', R2_ACCOUNT_ID: 'shell' })).toEqual({})
  expect(await targetStores({ ...preview, storage: null }, { TEMPLATE_TOOLS_R2_ACCOUNT_ID: 'a', TEMPLATE_TOOLS_R2_ACCESS_KEY_ID: 'b', TEMPLATE_TOOLS_R2_SECRET_ACCESS_KEY: 'c' })).toEqual({})
})
