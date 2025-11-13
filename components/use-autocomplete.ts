'use client'

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react'

interface UseAutocompleteOptions {
  filteredCount: number
  onSelect: (index: number) => void
  onBackspaceEmpty?: () => void
  isInputEmpty?: () => boolean
}

interface UseAutocompleteResult<T extends HTMLElement> {
  open: boolean
  setOpen: (open: boolean) => void
  highlightIdx: number
  setHighlightIdx: (idx: number | ((prev: number) => number)) => void
  wrapperRef: RefObject<T | null>
  showDropdown: boolean
  handleKeyDown: (e: React.KeyboardEvent) => void
}

/**
 * Shared dropdown state machine for AutocompleteInput / MultiSelectInput.
 * Handles outside-click close, arrow-key navigation, Enter to select,
 * Escape to close, and (optionally) Backspace-on-empty for chip removal.
 */
export function useAutocomplete<T extends HTMLElement = HTMLDivElement>({
  filteredCount,
  onSelect,
  onBackspaceEmpty,
  isInputEmpty,
}: UseAutocompleteOptions): UseAutocompleteResult<T> {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef<T>(null)

  const showDropdown = open && filteredCount > 0

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { setHighlightIdx(-1) }, [filteredCount])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (onBackspaceEmpty && isInputEmpty?.() && e.key === 'Backspace') {
      onBackspaceEmpty()
      return
    }
    if (!showDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev + 1) % filteredCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev <= 0 ? filteredCount - 1 : prev - 1))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      onSelect(highlightIdx)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }, [showDropdown, highlightIdx, filteredCount, onSelect, onBackspaceEmpty, isInputEmpty])

  return { open, setOpen, highlightIdx, setHighlightIdx, wrapperRef, showDropdown, handleKeyDown }
}
