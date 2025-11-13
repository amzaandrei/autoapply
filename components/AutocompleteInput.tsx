'use client'

import { Input } from '@/components/ui/input'
import { useAutocomplete } from './use-autocomplete'

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  id?: string
}

export function AutocompleteInput({ value, onChange, suggestions, placeholder, id }: AutocompleteInputProps) {
  const filtered = value.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
    : []

  const { setOpen, highlightIdx, setHighlightIdx, wrapperRef, showDropdown, handleKeyDown } = useAutocomplete({
    filteredCount: filtered.length,
    onSelect: (i) => { onChange(filtered[i]); setOpen(false) },
  })

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
