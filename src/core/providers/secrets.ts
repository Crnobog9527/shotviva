import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { z } from 'zod'

import { AppError } from '../errors'

// AES-256-GCM for the API keys in ai_providers (ARCHITECTURE §3.3). Stored as
// `v1.<iv>.<tag>.<ciphertext>`, each part base64url. The version prefix leaves room to change
// the scheme without guessing what an old value is.

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

// Thrown when a stored key cannot be decrypted: almost always PROVIDER_SECRETS_KEY changed (or
// differs between Preview and Production) after the key was saved. The fix is to re-enter it.
export class ProviderSecretError extends AppError {
  constructor() {
    super(
      'INTERNAL',
      'Stored provider API key cannot be decrypted with the current PROVIDER_SECRETS_KEY; re-enter the key in /admin/providers',
    )
    this.name = 'ProviderSecretError'
  }
}

// PROVIDER_SECRETS_KEY is unset or malformed: an Owner setup step, not a user error.
export class ProviderSecretsKeyError extends AppError {
  constructor(message: string) {
    super('INTERNAL', message)
    this.name = 'ProviderSecretsKeyError'
  }
}

const secretsKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .transform((value) => Buffer.from(value, 'base64'))
  .refine((key) => key.length === 32)

// Parses PROVIDER_SECRETS_KEY. Never echoes the value in the error.
export function parseSecretsKey(value: string | undefined): Buffer {
  if (!value) throw new ProviderSecretsKeyError('PROVIDER_SECRETS_KEY is not configured')
  const parsed = secretsKeySchema.safeParse(value)
  if (!parsed.success) throw new ProviderSecretsKeyError('PROVIDER_SECRETS_KEY must be 32 bytes, base64-encoded')
  return parsed.data
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const parts = [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url'))
  return [VERSION, ...parts].join('.')
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, body, ...rest] = payload.split('.')
  if (version !== VERSION || !iv || !tag || body === undefined || rest.length > 0) throw new ProviderSecretError()
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: TAG_BYTES })
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new ProviderSecretError()
  }
}

// The last four characters, for the admin list. Short keys show fewer so most of a key never
// leaves the server.
export function lastFour(apiKey: string): string {
  return apiKey.length > 8 ? apiKey.slice(-4) : apiKey.slice(-1)
}
