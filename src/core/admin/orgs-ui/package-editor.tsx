'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { ORGS_COPY as COPY } from '../orgs/copy'
import type { OrgActionResult, OrgPackage } from '../orgs/types'
import { unitPricePer100Credits } from '@/core/org/unit-price'

import { Card, Check, Field, Outcome } from './fields'
import { useOrgAction } from './use-org-action'

export type SavePackageAction = (input: unknown) => Promise<OrgActionResult>

function dollars(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function initialFields(pkg: OrgPackage | null) {
  if (!pkg) return { name: '', price: '', credits: '', sort: '0', active: true }
  return { name: pkg.name, price: dollars(pkg.priceUsdCents), credits: String(pkg.credits), sort: String(pkg.sort), active: pkg.active }
}

// One package: price in USD and credits exactly as typed, no exchange-rate maths. `pkg` null is
// the "add" form, which clears itself after a save.
function PackageForm({ pkg, save }: { pkg: OrgPackage | null; save: SavePackageAction }) {
  const initial = initialFields(pkg)
  const [name, setName] = useState(initial.name)
  const [price, setPrice] = useState(initial.price)
  const [credits, setCredits] = useState(initial.credits)
  const [sort, setSort] = useState(initial.sort)
  const [active, setActive] = useState(initial.active)
  const { pending, outcome, run } = useOrgAction()
  return (
    <form
      className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_6rem_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => save({ id: pkg?.id ?? '', expectedUpdatedAt: pkg?.updatedAt ?? '', name, priceUsd: price, credits, sort, active }), () => {
          if (pkg) return
          const blank = initialFields(null)
          setName(blank.name); setPrice(blank.price); setCredits(blank.credits); setSort(blank.sort); setActive(blank.active)
        })
      }}
    >
      <Field label={COPY.packageName}><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={COPY.priceUsd}><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      {pkg ? <UnitPrice pkg={pkg} /> : null}
      <Field label={COPY.packageCredits}><Input inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
      <Field label={COPY.sort}><Input inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} /></Field>
      <div className="flex items-end"><Check label={COPY.active} checked={active} onChange={(e) => setActive(e.target.checked)} /></div>
      <div className="flex items-end"><Button type="submit" disabled={pending || !name.trim() || !price.trim() || !credits.trim()}>{pending ? COPY.saving : pkg ? COPY.packageSave : COPY.packageAdd}</Button></div>
      <div className="sm:col-span-2 lg:col-span-6"><Outcome outcome={outcome} /></div>
    </form>
  )
}

// Computed from the saved price and credits.
function UnitPrice({ pkg }: { pkg: OrgPackage }) {
  const unit = unitPricePer100Credits(pkg.priceUsdCents, pkg.credits)
  return unit === null ? null : <p className="text-xs text-muted-foreground sm:col-span-full">{COPY.unitPrice(unit)}</p>
}

export function PackageEditor({ packages, save }: { packages: OrgPackage[]; save: SavePackageAction }) {
  return (
    <div className="grid gap-4">
      <Card title={COPY.packagesTitle} hint={COPY.packagesHint}>
        {packages.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.packagesEmpty}</p> : null}
        <div className="grid gap-3">
          {packages.map((pkg) => <PackageForm key={pkg.id} pkg={pkg} save={save} />)}
        </div>
      </Card>
      <Card title={COPY.packageNew}>
        <PackageForm pkg={null} save={save} />
      </Card>
    </div>
  )
}
