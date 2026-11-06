// Entry for src/proxy.ts only: the gates without the sign-in flows, which pull in next-intl's
// request config (and next/root-params, which the proxy runtime does not have).
export { proxyGate, type ProxyGateOptions } from './proxy-gates'
export { forwardRequest, type Forward } from './update-session'
