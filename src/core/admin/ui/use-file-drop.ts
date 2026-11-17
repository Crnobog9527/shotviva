'use client'

import { useState, type DragEvent } from 'react'

// Only handle files from outside the page. Sortable rows use their own pointer gestures.
export function useFileDrop(onFile: (file: File) => void, disabled = false) {
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
    if (!disabled) setActive(true)
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(false)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    setActive(false)
    if (disabled) return
    if (event.dataTransfer.files.length !== 1) {
      setError('请一次拖入一个文件')
      return
    }
    setError('')
    onFile(event.dataTransfer.files[0]!)
  }

  return { active, error, onDragOver, onDragLeave, onDrop }
}
