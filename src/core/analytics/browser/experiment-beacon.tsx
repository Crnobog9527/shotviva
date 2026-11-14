'use client'

import { useEffect } from 'react'

import { reportExperiments } from './experiments'

// On a page an A/B experiment tests (the home hero, ARCHITECTURE §16.5): reports the assignment
// the proxy just made, also when the page was reached by a client-side navigation. Draws nothing.
export function ExperimentBeacon() {
  useEffect(() => {
    reportExperiments()
  }, [])
  return null
}
