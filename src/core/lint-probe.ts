// Negative check: core must not import modules. Removed in the next commit.
import { imageModuleId } from '@/modules/image'
import { videoModuleId } from '../modules/video'

export const probe = [imageModuleId, videoModuleId]
