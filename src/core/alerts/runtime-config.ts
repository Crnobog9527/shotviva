import 'server-only'

import { serverEnv } from '../env'
import { logger } from '../logger'
import { feishuConfig, type FeishuConfig } from './alerts-env'

let config: FeishuConfig | null | undefined

export function runtimeFeishuConfig(): FeishuConfig | null {
  if (config !== undefined) return config
  try {
    const checked = feishuConfig(serverEnv())
    if (checked.problem) logger.warn('owner alerts are off', { problem: checked.problem })
    config = checked.config
  } catch (error) {
    logger.warn('owner alert setup failed', { error })
    config = null
  }
  return config
}
