'use client'

import { Source, Layer } from 'react-map-gl/mapbox'

interface AppliedPoint {
  lat: number
  lng: number
  companyCount: number
  appliedCount?: number
}

interface Opportunity {
  id: string
  name: string
  lat: number
  lng: number
  weight: number
  jobCount?: number
  tier?: 1 | 2 | 3
}

interface MapLayersProps {
  appliedPoints: AppliedPoint[]
  opportunities: Opportunity[]
  showHeatMap: boolean
  showOpportunities: boolean
}

export function MapLayers({ appliedPoints, opportunities, showHeatMap, showOpportunities }: MapLayersProps) {
  // GeoJSON for applied heat
  const appliedGeoJson = {
    type: 'FeatureCollection' as const,
    features: appliedPoints.map((p) => ({
      type: 'Feature' as const,
      properties: {
        weight: Math.min(10, p.companyCount),
        count: p.companyCount,
      },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  }

  // GeoJSON for opportunities
  const oppGeoJson = {
    type: 'FeatureCollection' as const,
    features: opportunities.map((o) => ({
      type: 'Feature' as const,
      properties: { name: o.name, weight: o.weight, jobCount: o.jobCount ?? 0, id: o.id },
      geometry: { type: 'Point' as const, coordinates: [o.lng, o.lat] },
    })),
  }

  return (
    <>
      {showHeatMap && (
        <Source id="applied-heat-src" type="geojson" data={appliedGeoJson}>
          {/* Heatmap layer (visible at all zooms) */}
          <Layer
            id="applied-heat-layer"
            type="heatmap"
            paint={{
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 3],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0,   'rgba(0,0,0,0)',
                0.2, 'rgba(253,219,199,0.6)',
                0.4, 'rgb(253,174,97)',
                0.6, 'rgb(239,138,98)',
                0.8, 'rgb(214,96,77)',
                1,   'rgb(178,24,43)',
              ],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 10, 40],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.85, 10, 0.45],
            }}
          />
          {/* Exact circles when zoomed in */}
          <Layer
            id="applied-point-layer"
            type="circle"
            minzoom={8}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 20, 18],
              'circle-color': 'rgb(178,24,43)',
              'circle-opacity': 0.85,
              'circle-stroke-color': 'rgb(103,0,13)',
              'circle-stroke-width': 1,
            }}
          />
          <Layer
            id="applied-point-count-layer"
            type="symbol"
            minzoom={8}
            layout={{
              'text-field': ['get', 'count'],
              'text-size': 11,
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': 'white',
            }}
          />
        </Source>
      )}

      {showOpportunities && (
        <Source id="opportunities-src" type="geojson" data={oppGeoJson}>
          <Layer
            id="opportunities-circle"
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 1, 5, 10, 16],
              'circle-color': '#10b981',
              'circle-opacity': 0.75,
              'circle-stroke-color': '#065f46',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="opportunities-label"
            type="symbol"
            minzoom={3}
            layout={{
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-offset': [0, 1.4],
              'text-anchor': 'top',
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-allow-overlap': false,
            }}
            paint={{
              'text-color': '#047857',
              'text-halo-color': 'rgba(255,255,255,0.9)',
              'text-halo-width': 1.5,
            }}
          />
        </Source>
      )}
    </>
  )
}
