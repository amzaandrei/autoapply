'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Sparkles, Loader2, CheckCircle, XCircle, ArrowRight, Building2 } from 'lucide-react'

interface GenerateResult {
  companyId: string
  companyName: string
  emailId?: string
  error?: string
}

function GeneratePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = searchParams.get('campaignId') ?? ''

  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<GenerateResult[]>([])
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  const companies = trpc.companies.list.useQuery({ campaignId }, { enabled: !!campaignId })
  const profile = trpc.profile.get.useQuery()

  const total = companies.data?.length ?? 0

  const handleGenerate = async () => {
    if (!campaignId) return
    if (!profile.data?.cvText) {
      toast.error('No CV found. Go back and upload your CV first.')
      return
    }
    if (total === 0) {
      toast.error('No companies found. Go back and add companies first.')
      return
    }

    setGenerating(true)
    setResults([])
    setProgress(0)
    setDone(false)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })

      const data = await res.json() as {
        generated?: number
        failed?: number
        results?: GenerateResult[]
        error?: string
      }

      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      setResults(data.results ?? [])
      setProgress(100)
      setDone(true)

      if ((data.generated ?? 0) > 0) {
        toast.success(`${data.generated} emails generated — ready to review.`)
      } else {
        toast.error('Generation failed for all companies.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm text-muted-foreground">
          <span className="line-through">1 Upload CV</span>
          <ArrowRight className="h-4 w-4" />
          <span className="line-through">2 Discover</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-semibold text-primary">3 Generate</span>
          <ArrowRight className="h-4 w-4" />
          <span>4 Review</span>
          <ArrowRight className="h-4 w-4" />
          <span>5 Send</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Generate Personalized Emails
            </CardTitle>
            <CardDescription>
              Claude AI writes a tailored application email for each company using your CV and
              company context. More relevant = more responses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Companies summary */}
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium">{total} companies queued</p>
                <p className="text-sm text-muted-foreground">
                  {profile.data?.jobTitle
                    ? `Applying for ${profile.data.jobTitle}`
                    : 'Set a job title in your profile for better results'}
                </p>
              </div>
            </div>

            {/* Progress */}
            {generating && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Generating with Claude AI...</span>
                  <span>{results.length}/{total}</span>
                </div>
                <Progress value={(results.length / Math.max(total, 1)) * 100} />
              </div>
            )}

            {/* Generate button */}
            {!done ? (
              <Button
                className="w-full"
                size="lg"
                onClick={() => void handleGenerate()}
                disabled={generating || total === 0}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating {results.length + 1} of {total}...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate All Emails
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => router.push(`/review?campaignId=${campaignId}`)}
              >
                Review Emails <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.companyId}
                    className="flex items-center gap-3 p-2 rounded-md text-sm"
                  >
                    {r.error ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                    <span className="flex-1">{r.companyName}</span>
                    {r.error ? (
                      <Badge variant="destructive" className="text-xs">{r.error}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">done</Badge>
                    )}
                  </div>
                ))}
                {done && (
                  <div className="text-sm text-center text-muted-foreground pt-2">
                    {results.filter((r) => !r.error).length} generated ·{' '}
                    {results.filter((r) => r.error).length} failed
                  </div>
                )}
              </div>
            )}

            {done && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                No emails generated. Check that you have a CV and companies added.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function GeneratePageWrapper() {
  return (
    <Suspense>
      <GeneratePage />
    </Suspense>
  )
}
