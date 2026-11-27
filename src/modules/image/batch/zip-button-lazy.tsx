'use client'

import dynamic from 'next/dynamic'

// Save all (the phone's photo save, or the ZIP) shows on a settled batch and on Photos' batch groups only; loaded on first use
// rather than riding in every app page's first load (scripts/js-budget.json).
export const ZipButtonLazy = dynamic(() => import('./batch-save-button').then((m) => m.BatchSaveButton))
