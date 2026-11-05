import { AppError, type ErrorBody } from '../errors'
import { ProviderError } from './provider'

// A generation that failed after credits were reserved. The body tells the client which job
// it was and whether the credits came back, so the UI can say "your image was refunded".
export class GenerationFailure extends AppError {
  readonly jobId: string
  readonly refunded: boolean

  constructor(source: AppError, jobId: string, refunded: boolean) {
    super(source.code, source.message, { cause: source })
    this.jobId = jobId
    this.refunded = refunded
  }

  override toBody(): ErrorBody & { job_id: string; refunded: boolean } {
    return { ...super.toBody(), job_id: this.jobId, refunded: this.refunded }
  }
}

// Stage that failed → (error_code stored on the job, error shown to the client).
export type FailureStage = 'provider' | 'store_output' | 'confirm'

export function classifyFailure(stage: FailureStage, error: unknown): { jobCode: string; error: AppError } {
  if (error instanceof ProviderError) {
    if (error.kind === 'content_rejected') {
      return { jobCode: 'CONTENT_REJECTED', error: new AppError('CONTENT_REJECTED', 'This photo or text was declined by the image model') }
    }
    const jobCode = error.kind === 'timeout' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILED'
    return { jobCode, error: new AppError('GENERATION_FAILED', 'Generation failed') }
  }
  const jobCode = stage === 'store_output' ? 'OUTPUT_WRITE_FAILED' : stage === 'confirm' ? 'CONFIRM_FAILED' : 'PROVIDER_FAILED'
  return { jobCode, error: new AppError('GENERATION_FAILED', 'Generation failed') }
}
