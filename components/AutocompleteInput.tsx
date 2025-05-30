'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  id?: string
}

export function AutocompleteInput({ value, onChange, suggestions, placeholder, id }: AutocompleteInputProps) {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
    : []

  const showDropdown = open && filtered.length > 0

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Reset highlight when list changes
  useEffect(() => { setHighlightIdx(-1) }, [filtered.length])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      onChange(filtered[highlightIdx])
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }, [showDropdown, highlightIdx, filtered, onChange])

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto py-1">
          {filtered.map((item, i) => {
            // Bold the matching part
            const idx = item.toLowerCase().indexOf(value.toLowerCase())
            const before = item.slice(0, idx)
            const match = item.slice(idx, idx + value.length)
            const after = item.slice(idx + value.length)

            return (
              <li
                key={item}
                className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
                  i === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
                onMouseEnter={() => setHighlightIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(item)
                  setOpen(false)
                }}
              >
                {before}<span className="font-semibold">{match}</span>{after}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
