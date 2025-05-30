'use client'

import { useCallback } from 'react'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const BASE = 'https://api.mapbox.com/search/geocode/v6'

export interface GeocodedLocation {
  id: string
  name: string
  shortName: string
  lng: number
  lat: number
}

function toShortName(fullName: string): string {
  const parts = fullName.split(', ')
  if (parts.length <= 2) return fullName
  return `${parts[0]}, ${parts[parts.length - 1]}`
}

export function useMapboxGeocode() {
  const reverseGeocode = useCallback(async (lng: number, lat: number): Promise<GeocodedLocation | null> => {
    try {
      const res = await fetch(
        `${BASE}/reverse?longitude=${lng}&latitude=${lat}&types=place,country&limit=1&access_token=${TOKEN}`
      )
      if (!res.ok) return null
      const data = await res.json()
      const feature = data.features?.[0]
      if (!feature) return null
      const name: string = feature.properties?.full_address ?? feature.properties?.name ?? 'Unknown'
      return {
        id: feature.id ?? `${lng},${lat}`,
        name,
        shortName: toShortName(name),
        lng: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
      }
    } catch {
      console.warn('Reverse geocode failed')
      return null
    }
  }, [])

  const forwardGeocode = useCallback(async (query: string): Promise<GeocodedLocation[]> => {
    if (!query.trim()) return []
    try {
      const res = await fetch(
        `${BASE}/forward?q=${encodeURIComponent(query)}&types=place,country,locality&limit=5&access_token=${TOKEN}`
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data.features ?? []).map((f: { id?: string; properties?: { full_address?: string; name?: string }; geometry: { coordinates: number[] } }) => ({
        id: f.id ?? `${f.geometry.coordinates[0]},${f.geometry.coordinates[1]}`,
        name: f.properties?.full_address ?? f.properties?.name ?? 'Unknown',
        shortName: toShortName(f.properties?.full_address ?? f.properties?.name ?? 'Unknown'),
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }))
    } catch {
      console.warn('Forward geocode failed')
      return []
    }
  }, [])

  return { reverseGeocode, forwardGeocode }
}
