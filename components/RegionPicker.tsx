'use client'

import { useState, useEffect, useRef } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Globe, Laptop, MapPin, X, Search, Flame } from 'lucide-react'
import { useMapboxGeocode, type GeocodedLocation } from '@/components/hooks/useMapboxGeocode'
import { useTheme } from 'next-themes'
import { MapLayers } from '@/components/MapLayers'
import { trpc } from '@/lib/trpc'

type WorkMode = 'remote' | 'onsite' | 'both'

const WORK_MODES: { value: WorkMode; label: string; desc: string; icon: typeof Globe }[] = [
  { value: 'remote', label: 'Remote',           desc: 'Work from anywhere',         icon: Laptop },
  { value: 'onsite', label: 'On-site / Hybrid', desc: 'Specific locations',          icon: MapPin },
  { value: 'both',   label: 'Open to Both',     desc: 'Remote + specific locations', icon: Globe },
]

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface RegionPickerProps {
  value: string
  onChange: (value: string) => void
}

export function RegionPicker({ value, onChange }: RegionPickerProps) {
  const { resolvedTheme } = useTheme()
  const { reverseGeocode, forwardGeocode } = useMapboxGeocode()

  const [workMode, setWorkMode] = useState<WorkMode | null>(null)
  const [pins, setPins] = useState<GeocodedLocation[]>([])
  const [showCoverage, setShowCoverage] = useState(false)

  // Heat map + opportunity queries — only fetch when coverage layer is toggled on
  const heatData = trpc.regions.getAppliedHeatData.useQuery(undefined, { enabled: showCoverage })
  const opportunities = trpc.regions.getOpportunities.useQuery({ excludeNearKm: 50 }, { enabled: showCoverage })

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodedLocation[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const searchRef = useRef<HTMLDivElement>(null)

  // Map viewport
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
  })

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced forward geocode
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const results = await forwardGeocode(searchQuery)
      setSearchResults(results)
      setHighlightIdx(-1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, forwardGeocode])

  function buildOutput(mode: WorkMode | null, currentPins: GeocodedLocation[]) {
    const parts: string[] = []
    if (mode === 'remote' || mode === 'both') parts.push('Remote')
    parts.push(...currentPins.map((p) => p.shortName))
    onChange(parts.length > 0 ? parts.join(', ') : '')
  }

  function handleModeChange(mode: WorkMode) {
    setWorkMode(mode)
    if (mode === 'remote') {
      setPins([])
      onChange('Remote')
    } else {
      buildOutput(mode, pins)
    }
  }

  function addPin(location: GeocodedLocation) {
    // Deduplicate by shortName
    if (pins.some((p) => p.shortName === location.shortName)) return
    const next = [...pins, location]
    setPins(next)
    buildOutput(workMode, next)
  }

  function removePin(id: string) {
    const next = pins.filter((p) => p.id !== id)
    setPins(next)
    buildOutput(workMode, next)
  }

  function clearAll() {
    setWorkMode(null)
    setPins([])
    setSearchQuery('')
    setSearchResults([])
    onChange('')
  }

  async function handleMapClick(event: { lngLat: { lng: number; lat: number } }) {
    const location = await reverseGeocode(event.lngLat.lng, event.lngLat.lat)
    if (location) addPin(location)
  }

  function handleSelectResult(location: GeocodedLocation) {
    addPin(location)
    setSearchQuery('')
    setSearchOpen(false)
    setSearchResults([])
    setViewState({ longitude: location.lng, latitude: location.lat, zoom: 4 })
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (!searchOpen || searchResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev + 1) % searchResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      handleSelectResult(searchResults[highlightIdx])
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }

  const showLocations = workMode === 'onsite' || workMode === 'both'
  const mapStyle = resolvedTheme === 'dark'
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11'

  return (
    <div className="space-y-3">
      {/* Work mode cards */}
      <div className="grid grid-cols-3 gap-2">
        {WORK_MODES.map((mode) => {
          const Icon = mode.icon
          const active = workMode === mode.value
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleModeChange(mode.value)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-colors text-center ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${active ? 'text-primary' : ''}`}>{mode.label}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{mode.desc}</span>
            </button>
          )
        })}
      </div>

      {/* Map + search */}
      {showLocations && (
        <div className="space-y-2">
          {/* Search box */}
          <div ref={searchRef} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search for a city or country..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="pl-9"
              autoComplete="off"
            />
            {searchOpen && searchResults.length > 0 && (
              <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto py-1">
                {searchResults.map((result, i) => (
                  <li
                    key={result.id}
                    className={`cursor-pointer px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                      i === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    }`}
                    onMouseEnter={() => setHighlightIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleSelectResult(result)
                    }}
                  >
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {result.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Map */}
          <div className="rounded-lg overflow-hidden border" style={{ height: 280 }}>
            {MAPBOX_TOKEN ? (
              <Map
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                onClick={handleMapClick}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle={mapStyle}
                style={{ width: '100%', height: '100%' }}
                cursor="crosshair"
              >
                <MapLayers
                  appliedPoints={heatData.data?.points ?? []}
                  opportunities={opportunities.data ?? []}
                  showHeatMap={showCoverage}
                  showOpportunities={showCoverage}
                />
                {pins.map((pin) => (
                  <Marker key={pin.id} longitude={pin.lng} latitude={pin.lat} anchor="bottom">
                    <MapPin className="h-6 w-6 text-primary fill-primary/20 drop-shadow" />
                  </Marker>
                ))}
              </Map>
            ) : (
              <div className="flex items-center justify-center h-full bg-muted text-muted-foreground text-sm">
                Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Click the map to pin a location, or search above.
            </p>
            <button
              type="button"
              onClick={() => setShowCoverage((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
                showCoverage
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
              }`}
              title="Show applied regions (red) + tech hub opportunities (green)"
            >
              <Flame className="h-3 w-3" />
              {showCoverage ? 'Coverage on' : 'Show coverage'}
            </button>
          </div>

          {showCoverage && (
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-6 rounded-full" style={{ background: 'linear-gradient(to right, rgba(253,219,199,0.9), rgb(178,24,43))' }} />
                Applied
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 border border-emerald-700" />
                Opportunity
              </span>
              {heatData.data && (
                <span className="ml-auto">
                  {heatData.data.stats.totalCompanies} applied · {opportunities.data?.length ?? 0} untapped
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected locations */}
      {value && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">Targeting:</span>
          {(workMode === 'remote' || workMode === 'both') && (
            <Badge variant="secondary" className="text-xs">Remote</Badge>
          )}
          {pins.map((pin) => (
            <Badge key={pin.id} variant="secondary" className="text-xs gap-1">
              {pin.shortName}
              <button
                type="button"
                className="ml-0.5 hover:text-destructive"
                onClick={() => removePin(pin.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button type="button" onClick={clearAll} className="text-muted-foreground hover:text-destructive transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
