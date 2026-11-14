import 'server-only'

import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

import { ProviderSettingError, type ProviderSettingReason } from './setting-error'

// base_url rules (ARCHITECTURE §3.3): https only, and never a host on this machine, a private
// network or a reserved range, so a provider setting cannot point the server at internal
// services. The table check enforces https as well.

// Two lists: Node matches IPv4 addresses against IPv4-mapped IPv6 rules too, so one shared list
// with ::ffff:0:0/96 would block every IPv4 address.
const BLOCKED_V4 = new BlockList()
const BLOCKED_V6 = new BlockList()
const V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const
const V6 = [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const
for (const [net, prefix] of V4) BLOCKED_V4.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of V6) BLOCKED_V6.addSubnet(net, prefix, 'ipv6')

// Names that only resolve inside a network (RFC 6761 / 6762 / 8375 and common internal TLDs).
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.corp']

function invalid(reason: ProviderSettingReason, detail: string): ProviderSettingError {
  return new ProviderSettingError(reason, `base_url ${detail}`)
}

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 0) return true
  // IPv4-mapped and NAT64 IPv6 forms are blocked outright (::ffff:0:0/96, 64:ff9b::/96).
  return version === 4 ? BLOCKED_V4.check(address, 'ipv4') : BLOCKED_V6.check(address, 'ipv6')
}

function assertPublicName(hostname: string): void {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw invalid('base_url_private', 'points at a private or reserved address')
    return
  }
  if (host === 'localhost' || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw invalid('base_url_private', 'points at a local or internal host')
  }
  // A single-label name only resolves on a local network.
  if (!host.includes('.')) throw invalid('base_url_private', 'needs a public domain name')
}

// Validates and normalises (no trailing slash) without the network. Used on every save.
export function parseBaseUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw invalid('base_url_invalid', 'is not a valid URL')
  }
  if (url.protocol !== 'https:') throw invalid('base_url_not_https', 'must start with https://')
  if (url.username || url.password) throw invalid('base_url_invalid', 'must not contain credentials')
  if (url.search || url.hash) throw invalid('base_url_invalid', 'must not contain a query or fragment')
  assertPublicName(url.hostname)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export type HostResolver = (hostname: string) => Promise<string[]>

const resolveAll: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)

// Also rejects a public-looking name that resolves to a blocked address. Runs on save and before
// a connection test; generation trusts the saved row.
export async function assertPublicBaseUrl(baseUrl: string, resolve: HostResolver = resolveAll): Promise<string> {
  const normalised = parseBaseUrl(baseUrl)
  const hostname = new URL(normalised).hostname.replace(/^\[|\]$/g, '')
  if (isIP(hostname)) return normalised
  let addresses: string[]
  try {
    addresses = await resolve(hostname)
  } catch {
    throw invalid('base_url_unresolvable', 'host name does not resolve')
  }
  if (addresses.length === 0) throw invalid('base_url_unresolvable', 'host name does not resolve')
  if (addresses.some(isBlockedAddress)) throw invalid('base_url_private', 'resolves to a private or reserved address')
  return normalised
}
