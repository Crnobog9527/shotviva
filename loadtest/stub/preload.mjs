// Loaded into `next start` with NODE_OPTIONS=--import (see loadtest/README.md). Sends the app's
// TLS connections for R2 and api.openai.com to the local stub instead of the internet, keeping
// the original server name, so the app code runs unchanged. Load tests only.
import tls from 'node:tls'

const port = Number(process.env.LOADTEST_STUB_PORT ?? 8443)
const redirected = (host) => host === 'api.openai.com' || /\.r2\.cloudflarestorage\.com$/.test(host ?? '')
const connect = tls.connect
tls.connect = function patched(...args) {
  const options = typeof args[0] === 'object' && args[0] !== null ? args[0] : null
  if (options) {
    const host = options.servername || options.host
    if (redirected(host)) {
      args[0] = { ...options, host: '127.0.0.1', port, servername: host }
    }
  }
  return connect.apply(this, args)
}
