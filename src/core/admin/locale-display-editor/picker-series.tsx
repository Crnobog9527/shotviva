'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

type SeriesOption = { id: string; nameZh: string }

const PickerSeriesContext = createContext<ReadonlyMap<string, string>>(new Map())

// The series names the template pickers group by (Owner 2026-11-27). One provider on
// /admin/templates instead of threading the list through every panel that opens a picker.
export function PickerSeriesProvider({ series, children }: { series: readonly SeriesOption[]; children: ReactNode }) {
  const names = useMemo(() => new Map(series.map((one) => [one.id, one.nameZh])), [series])
  return <PickerSeriesContext.Provider value={names}>{children}</PickerSeriesContext.Provider>
}

export const usePickerSeriesNames = () => useContext(PickerSeriesContext)
