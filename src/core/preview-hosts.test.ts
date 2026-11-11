import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { previewHostsShape, resolveRequestOrigin } from './preview-hosts'

const BRANCH = 'https://shotviva-git-validation-preview-simons-projects-bfe3e99f.vercel.app'
const ALIASES = ['shotviva-qa-admin.vercel.app', 'shotviva-qa-user.vercel.app']
const preview = { vercelEnv: 'preview', appOrigin: BRANCH, extraHosts: ALIASES }
const parse = (value: string | undefined) => z.object(previewHostsShape).parse({ PREVIEW_EXTRA_HOSTS: value }).PREVIEW_EXTRA_HOSTS

describe('PREVIEW_EXTRA_HOSTS', () => {
  it('reads a comma-separated list of bare hostnames, trimmed and lower-cased', () => {
    expect(parse(' Shotviva-QA-Admin.vercel.app, shotviva-qa-user.vercel.app ,')).toEqual(ALIASES)
  })

  it('is empty when unset or blank', () => {
    expect(parse(undefined)).toEqual([])
    expect(parse('')).toEqual([])
  })

  it.each(['https://shotviva-qa-admin.vercel.app', 'shotviva-qa-admin.vercel.app:443', 'qa.vercel.app/x', 'localhost', '*.vercel.app'])(
    'rejects %s (scheme, port, path, single label or wildcard)',
    (value) => expect(() => parse(value)).toThrow(),
  )
})

describe('resolveRequestOrigin', () => {
  it('answers an allow-listed alias on its own host on a preview', () => {
    expect(resolveRequestOrigin('shotviva-qa-admin.vercel.app', preview)).toBe('https://shotviva-qa-admin.vercel.app')
    expect(resolveRequestOrigin('SHOTVIVA-QA-USER.vercel.app', preview)).toBe('https://shotviva-qa-user.vercel.app')
  })

  it('keeps the branch URL for the branch host itself', () => {
    expect(resolveRequestOrigin(new URL(BRANCH).host, preview)).toBe(BRANCH)
  })

  it.each([
    'evil.example',
    'shotviva-qa-admin.vercel.app.evil.example',
    'shotviva-qa-admin.vercel.app:8443',
    'shotviva-abc123-simons-projects-bfe3e99f.vercel.app',
  ])('falls back to appOrigin for a host not on the list: %s', (host) => {
    expect(resolveRequestOrigin(host, preview)).toBe(BRANCH)
  })

  it('falls back to appOrigin without a Host header', () => {
    expect(resolveRequestOrigin(null, preview)).toBe(BRANCH)
  })

  it('never trusts the Host header in production or locally, even for a listed host', () => {
    const production = { vercelEnv: 'production', appOrigin: 'https://shotviva.com', extraHosts: ALIASES }
    expect(resolveRequestOrigin('shotviva-qa-admin.vercel.app', production)).toBe('https://shotviva.com')
    const local = { vercelEnv: undefined, appOrigin: 'http://localhost:3000', extraHosts: ALIASES }
    expect(resolveRequestOrigin('shotviva-qa-admin.vercel.app', local)).toBe('http://localhost:3000')
  })
})
