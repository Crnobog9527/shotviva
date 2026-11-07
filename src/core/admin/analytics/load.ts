import 'server-only'

import { cacheLife } from 'next/cache'

import { logger } from '../../logger'
import { posthogAccess } from './access'
import { loadActivation, type Activation } from './activation'
import { loadFunnel, type Funnel, type FunnelDim } from './funnel'
import { loadPages, type PageRow } from './pages'
import { loadPayment, type Payment } from './payment'
import { PostHogQueryError, queryRunner, type RunQuery } from './posthog-query'
import { loadProblems, type Problems } from './problems'
import { windowFor, type Range, type Window } from './range'
import { loadTemplates, type TemplateRow } from './templates'

// One cached read per block (ARCHITECTURE §16.2a: 10 minutes, keyed by the range and, for the
// funnel, the dimension). The window is fixed when the cache fills, so a block's numbers and its
// PostHog link always describe the same stretch of time. A failure throws inside the cache, so it
// is not kept, and becomes 「暂时读不到」 for that block only.

export type Block<T> = { status: 'ok'; window: Window; data: T } | { status: 'error' }

function profile() {
  cacheLife({ stale: 300, revalidate: 600, expire: 900 })
}

function runner(): RunQuery {
  const access = posthogAccess()
  if (!access) throw new PostHogQueryError('unauthorized')
  return queryRunner(access)
}

async function cachedPages(range: Range) {
  'use cache'
  profile()
  const window = windowFor(range, new Date())
  return { window, data: await loadPages(runner(), window) }
}

async function cachedFunnel(range: Range, dim: FunnelDim) {
  'use cache'
  profile()
  const window = windowFor(range, new Date())
  return { window, data: await loadFunnel(runner(), window, dim) }
}

async function cachedPayment(range: Range) {
  'use cache'
  profile()
  const window = windowFor(range, new Date())
  return { window, data: await loadPayment(runner(), window) }
}

async function cachedActivation(range: Range, giftCredits: number) {
  'use cache'
  profile()
  const window = windowFor(range, new Date())
  return { window, data: await loadActivation(runner(), window, giftCredits) }
}

async function cachedTemplates(range: Range) {
  'use cache'
  profile()
  const window = windowFor(range, new Date())
  return { window, data: await loadTemplates(runner(), window) }
}

async function cachedProblems(range: Range) {
  'use cache'
  profile()
  const window = windowFor(range, new Date())
  return { window, data: await loadProblems(runner(), window) }
}

// `read` is injectable so tests skip Next's cache.
export async function readBlock<T>(name: string, read: () => Promise<{ window: Window; data: T }>): Promise<Block<T>> {
  try {
    return { status: 'ok', ...(await read()) }
  } catch (error) {
    if (error instanceof PostHogQueryError) logger.warn('admin.analytics.block_failed', { block: name, failure: error.failure, status: error.status })
    else logger.error('admin.analytics.block_failed', { block: name, error })
    return { status: 'error' }
  }
}

export const readPages = (range: Range): Promise<Block<PageRow[]>> => readBlock('pages', () => cachedPages(range))
export const readFunnel = (range: Range, dim: FunnelDim): Promise<Block<Funnel>> => readBlock('funnel', () => cachedFunnel(range, dim))
export const readPayment = (range: Range): Promise<Block<Payment>> => readBlock('payment', () => cachedPayment(range))
export const readActivation = (range: Range, giftCredits: number): Promise<Block<Activation>> =>
  readBlock('activation', () => cachedActivation(range, giftCredits))
export const readTemplates = (range: Range): Promise<Block<TemplateRow[]>> => readBlock('templates', () => cachedTemplates(range))
export const readProblems = (range: Range): Promise<Block<Problems>> => readBlock('problems', () => cachedProblems(range))
