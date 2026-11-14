import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

import { serverEnv } from '@/core/env'
import { NOINDEX } from '@/core/seo'

import { ThrowAfterMount } from './throw-after-mount'

export const metadata: Metadata = { title: 'Error test', robots: NOINDEX }

// Validation only: shows the marketing error boundary ((marketing)/error.tsx) on demand, on the
// test site and in local builds. On production the proxy answers 404 before this page runs
// (core/auth/proxy-gates.ts); the check below only keeps the page inert if it is ever reached.
async function Gate() {
  await connection()
  if (serverEnv().VERCEL_ENV === 'production') notFound()
  return <ThrowAfterMount />
}

export default function ErrorTest() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  )
}
