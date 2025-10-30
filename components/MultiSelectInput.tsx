'use client'

import { useState, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { useAutocomplete } from './use-autocomplete'

interface MultiSelectInputProps {
  selected: string[]
  onChange: (selected: string[]) => void
  suggestions: string[]
  placeholder?: string
}

export function MultiSelectInput({ selected, onChange, suggestions, placeholder }: MultiSelectInputProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = suggestions
    .filter((s) => !selected.includes(s))
    .filter((s) => !inputValue.trim() || s.toLowerCase().includes(inputValue.toLowerCase()))
    .slice(0, 8)

  const addItem = useCallback((item: string) => {
    onChange([...selected, item])
    setInputValue('')
    inputRef.current?.focus()
  }, [selected, onChange])

  const removeItem = useCallback((item: string) => {
    onChange(selected.filter((s) => s !== item))
  }, [selected, onChange])

  const { setOpen, highlightIdx, setHighlightIdx, wrapperRef, showDropdown, handleKeyDown } = useAutocomplete({
    filteredCount: filtered.length,
    onSelect: (i) => addItem(filtered[i]),
    onBackspaceEmpty: () => { if (selected.length > 0) removeItem(selected[selected.length - 1]) },
    isInputEmpty: () => !inputValue,
  })

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[36px] rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((item) => (
          <Badge key={item} variant="secondary" className="text-xs gap-1 shrink-0">
            {item}
            <button
              type="button"
              className="ml-0.5 hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); removeItem(item) }}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          placeholder={selected.length === 0 ? placeholder : 'Add more...'}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>
      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto py-1">
          {filtered.map((item, i) => {
            const query = inputValue.toLowerCase()
            const idx = query ? item.toLowerCase().indexOf(query) : -1
            let content
            if (idx >= 0) {
              const before = item.slice(0, idx)
              const match = item.slice(idx, idx + inputValue.length)
              const after = item.slice(idx + inputValue.length)
              content = <>{before}<span className="font-semibold">{match}</span>{after}</>
            } else {
              content = item
            }

            return (
              <li
                key={item}
                className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
                  i === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
                onMouseEnter={() => setHighlightIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addItem(item)
                }}
              >
                {content}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
