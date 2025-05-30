'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Map from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MapLayers } from '@/components/MapLayers'
import { ArrowLeft, Flame, MapPin, Target, TrendingUp, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export default function CoveragePage() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()

  const [viewState, setViewState] = useState({ longitude: 0, latitude: 20, zoom: 1.5 })
  const [mode, setMode] = useState<'both' | 'applied' | 'opportunities'>('both')
  const [backfilling, setBackfilling] = useState(false)

  const heatData = trpc.regions.getAppliedHeatData.useQuery()
  const opportunities = trpc.regions.getOpportunities.useQuery({ excludeNearKm: 50 })

  const mapStyle = resolvedTheme === 'dark'
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11'

  const topOpportunities = useMemo(
    () => (opportunities.data ?? []).slice(0, 10),
    [opportunities.data]
  )

  const flyTo = (lat: number, lng: number, zoom = 6) => {
    setViewState({ latitude: lat, longitude: lng, zoom })
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      const res = await fetch('/api/companies/backfill-locations', { method: 'POST' })
      const data = await res.json() as { processed?: number; geocoded?: number; skipped?: number; message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      if (data.processed === 0) {
        toast.info(data.message ?? 'Nothing to backfill.')
      } else {
        toast.success(`Located ${data.geocoded} of ${data.processed} companies`, {
          description: data.skipped ? `${data.skipped} could not be geocoded and were skipped.` : undefined,
        })
        heatData.refetch()
        opportunities.refetch()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backfill failed')
    } finally {
      setBackfilling(false)
    }
  }

  const showApplied = mode === 'both' || mode === 'applied'
  const showOpportunities = mode === 'both' || mode === 'opportunities'

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flame className="h-6 w-6 text-red-500" />
              Coverage Map
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Where you've applied (red) and where opportunities remain (green).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleBackfill()}
              disabled={backfilling}
              title="Geocode existing companies that don't have coordinates yet"
            >
              {backfilling ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Locating...</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5 mr-1" /> Sync Locations</>
              )}
            </Button>
            <div className="flex gap-1 rounded-md border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setMode('both')}
                className={`px-3 py-1 text-xs rounded ${mode === 'both' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                Both
              </button>
              <button
                type="button"
                onClick={() => setMode('applied')}
                className={`px-3 py-1 text-xs rounded ${mode === 'applied' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                Applied
              </button>
              <button
                type="button"
                onClick={() => setMode('opportunities')}
                className={`px-3 py-1 text-xs rounded ${mode === 'opportunities' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                Opportunities
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Sidebar */}
          <div className="space-y-3">
            <Card>
              <CardContent className="pt-5 pb-4 space-y-3">
                {heatData.isLoading ? (
                  <>
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Applied</span>
                    </div>
                    <p className="text-2xl font-bold leading-none">
                      {heatData.data?.stats.totalCompanies ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      companies across {heatData.data?.stats.uniqueRegions ?? 0} regions
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4 space-y-3">
                {opportunities.isLoading ? (
                  <>
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Opportunities</span>
                    </div>
                    <p className="text-2xl font-bold leading-none">
                      {opportunities.data?.length ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      tech hubs you haven&apos;t tapped yet
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Top opportunities list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Untapped Hubs</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {opportunities.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))
                  ) : topOpportunities.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No opportunities — you've covered every tech hub!
                    </p>
                  ) : (
                    topOpportunities.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => flyTo(o.lat, o.lng, 7)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-accent/50 transition-colors flex items-center gap-2"
                      >
                        <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="text-xs truncate flex-1">{o.name}</span>
                        {o.jobCount ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{o.jobCount} jobs</Badge>
                        ) : o.tier === 1 ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Top tier</Badge>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top applied regions */}
            {heatData.data && heatData.data.regions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Your Top Regions</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {heatData.data.regions.slice(0, 5).map((r) => (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => flyTo(r.lat, r.lng, 7)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-accent/50 transition-colors flex items-center gap-2"
                      >
                        <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                        <span className="text-xs truncate flex-1">{r.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {r.companyCount}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Map */}
          <div className="rounded-lg overflow-hidden border" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
            {MAPBOX_TOKEN ? (
              <Map
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle={mapStyle}
                style={{ width: '100%', height: '100%' }}
              >
                <MapLayers
                  appliedPoints={heatData.data?.points ?? []}
                  opportunities={opportunities.data ?? []}
                  showHeatMap={showApplied}
                  showOpportunities={showOpportunities}
                />
              </Map>
            ) : (
              <div className="flex items-center justify-center h-full bg-muted text-muted-foreground text-sm">
                Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
