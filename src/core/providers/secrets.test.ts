import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { decryptSecret, encryptSecret, lastFour, parseSecretsKey, ProviderSecretError, ProviderSecretsKeyError } from './secrets'

const KEY_B64 = randomBytes(32).toString('base64')
const SECRET = 'sk-test-0123456789abcdef'

describe('provider secrets (AES-256-GCM)', () => {
  it('round-trips a key and never stores it in the clear', () => {
    const key = parseSecretsKey(KEY_B64)
    const stored = encryptSecret(SECRET, key)
    expect(stored).toMatch(/^v1\./)
    expect(stored).not.toContain(SECRET)
    expect(decryptSecret(stored, key)).toBe(SECRET)
  })

  it('uses a fresh IV every time', () => {
    const key = parseSecretsKey(KEY_B64)
    expect(encryptSecret(SECRET, key)).not.toBe(encryptSecret(SECRET, key))
  })

  it('fails with a clear error once PROVIDER_SECRETS_KEY has changed', () => {
    const stored = encryptSecret(SECRET, parseSecretsKey(KEY_B64))
    const other = parseSecretsKey(randomBytes(32).toString('base64'))
    const error = (() => {
      try {
        decryptSecret(stored, other)
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toBeInstanceOf(ProviderSecretError)
    expect(String((error as Error).message)).toMatch(/PROVIDER_SECRETS_KEY.*re-enter/)
  })

  it('rejects tampered or malformed ciphertext the same way', () => {
    const key = parseSecretsKey(KEY_B64)
    const [version, iv, tag, body] = encryptSecret(SECRET, key).split('.') as [string, string, string, string]
    const flipped = `${body.slice(0, -2)}${body.endsWith('A') ? 'B' : 'A'}${body.slice(-1)}`
    expect(() => decryptSecret([version, iv, tag, flipped].join('.'), key)).toThrow(ProviderSecretError)
    expect(() => decryptSecret('plaintext-key', key)).toThrow(ProviderSecretError)
    expect(() => decryptSecret(`v2.${iv}.${tag}.${body}`, key)).toThrow(ProviderSecretError)
  })

  it('shows only the last four characters of a real key', () => {
    expect(lastFour('sk-proj-abcdefgh1234')).toBe('1234')
    expect(lastFour('short')).toBe('t')
  })
})

describe('PROVIDER_SECRETS_KEY', () => {
  it('accepts a key with a trailing newline or surrounding spaces, as pasted into Vercel', () => {
    const clean = parseSecretsKey(KEY_B64)
    expect(parseSecretsKey(`${KEY_B64}\n`).equals(clean)).toBe(true)
    expect(parseSecretsKey(`${KEY_B64}\r\n`).equals(clean)).toBe(true)
    expect(parseSecretsKey(`  ${KEY_B64}  `).equals(clean)).toBe(true)
    const stored = encryptSecret(SECRET, parseSecretsKey(`${KEY_B64}\n`))
    expect(decryptSecret(stored, clean)).toBe(SECRET)
  })

  it('tells an unset key apart from a malformed one, without echoing the value', () => {
    for (const unset of [undefined, '', '   ', '\n']) {
      expect(() => parseSecretsKey(unset)).toThrow(expect.objectContaining({ problem: 'missing' }))
    }
    const short = randomBytes(16).toString('base64')
    const long = randomBytes(48).toString('base64')
    for (const bad of [short, long, 'not base64 at all!', `${KEY_B64.slice(0, 20)} ${KEY_B64.slice(20)}`]) {
      const error = (() => {
        try {
          parseSecretsKey(bad)
        } catch (caught) {
          return caught
        }
      })()
      expect(error).toBeInstanceOf(ProviderSecretsKeyError)
      expect(error).toMatchObject({ problem: 'malformed' })
      expect(String((error as Error).message)).toMatch(/32 bytes/)
      expect(String((error as Error).message)).not.toContain(bad)
    }
  })
})
