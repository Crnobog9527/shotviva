import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

import { logger } from '../logger'

// An explicit download (?download=1) of the caller's own finished work, kept as dispute evidence
// (record_job_download, 0724, T82): first time and IP, and a count. Best effort, after the
// response: a failed write is logged and never fails the download.
export async function recordJobDownload(db: RpcClient, input: { userId: string; jobId: string; ip: string | null }): Promise<void> {
  try {
    await callRpc(db, 'record_job_download', { p_job_id: input.jobId, p_user_id: input.userId, p_ip: input.ip }, z.boolean())
  } catch (error) {
    logger.warn('recording a download failed', { job_id: input.jobId, error })
  }
}
