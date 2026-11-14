'use client'

import { Button } from '@/core/ui/button'

// 新建模板 above the list; the search box sits in the list's own filter bar (catalog-view).
export function Toolbar({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex justify-end">
      <Button onClick={onNew}>新建模板</Button>
    </div>
  )
}
