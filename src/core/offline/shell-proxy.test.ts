import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { IDENTITY_HEADER } from '../auth/forwarded-identity'
import { shellProxyAnswer } from './shell-proxy'

const BUILD = 'dpl_test'
const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://shotviva.com${path}`, { headers })
// NextResponse.next/rewrite carry the forwarded request's headers as x-middleware-request-* entries.
const forwarded = (response: Response, name: string) => response.headers.get(`x-middleware-request-${name}`)

describe('the app shell in the proxy (ARCHITECTURE §18.3)', () => {
  it('forwards the shell without the visitor’s cookies or a forged identity, private and marked with the build', () => {
    for (const path of ['/app-shell/generate', '/zh/app-shell/generate']) {
      const response = shellProxyAnswer(request(path, { cookie: 'sb-access-token=secret', [IDENTITY_HEADER]: 'forged' }), BUILD)!
      expect(response).not.toBeNull()
      expect(forwarded(response, 'cookie')).toBeNull()
      expect(forwarded(response, IDENTITY_HEADER)).toBeNull()
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('x-sv-shell')).toBe(BUILD)
      expect(response.headers.get('x-robots-tag')).toBe('noindex')
      expect(response.headers.get('set-cookie')).toBeNull()
    }
    expect(shellProxyAnswer(request('/app-shell/generate'), BUILD)?.headers.get('x-middleware-rewrite')).toBe('https://shotviva.com/en/app-shell/generate')
  })

  it('answers a navigation preload of Create that carries this build’s shell header with an empty 204', () => {
    for (const path of ['/generate', '/zh/generate']) {
      expect(shellProxyAnswer(request(path, { 'service-worker-navigation-preload': `shell-${BUILD}` }), BUILD)?.status).toBe(204)
    }
  })

  it('leaves everything else to the rest of the proxy', () => {
    expect(shellProxyAnswer(request('/generate'), BUILD)).toBeNull()
    expect(shellProxyAnswer(request('/generate', { 'service-worker-navigation-preload': 'true' }), BUILD)).toBeNull()
    expect(shellProxyAnswer(request('/generate', { 'service-worker-navigation-preload': 'shell-dpl_old' }), BUILD)).toBeNull()
    expect(shellProxyAnswer(request('/photos', { 'service-worker-navigation-preload': `shell-${BUILD}` }), BUILD)).toBeNull()
  })

  it('answers any other spelling of a shell address with a 404, never the session path (review of #895)', () => {
    for (const path of ['/app-shell/generate/', '/zh/app-shell/generate/', '/App-Shell/generate', '/ZH/app-shell/generate', '/app%2Dshell/generate', '/en/app-shell/generate', '/app-shell/generate/x', '/app-shell/photos', '/app-shell', '/zh/app-shell']) {
      const response = shellProxyAnswer(request(path, { cookie: 'sb-access-token=secret' }), BUILD)
      expect(response?.status, path).toBe(404)
      expect(response && forwarded(response, 'cookie')).toBeNull()
    }
    expect(shellProxyAnswer(request('/app-shellfish'), BUILD)).toBeNull()
  })
})
