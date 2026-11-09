'use client'

import dynamic from 'next/dynamic'

import type { ResultActionProps } from './result-actions'

// Other app routes share the workspace shell but have no result to save.
const ResultActions = dynamic(() => import('./result-actions'))

export function ShareButton(props: ResultActionProps) {
  // Navigation must prepare the new photo before another tap can share it.
  return <ResultActions key={props.fileUrl} {...props} />
}
