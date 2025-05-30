'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Upload, FileText, Loader2, CheckCircle, ArrowRight } from 'lucide-react'
import { StepIndicator } from '@/components/StepIndicator'
import Link from 'next/link'

type UploadPhase = 'idle' | 'reading' | 'uploading' | 'parsing' | 'done'

const PHASE_CONFIG: Record<Exclude<UploadPhase, 'idle'>, { label: string; target: number }> = {
  reading:   { label: 'Reading file...',              target: 15 },
  uploading: { label: 'Uploading to server...',       target: 40 },
  parsing:   { label: 'AI is extracting your CV...', target: 90 },
  done:      { label: 'Done!',                        target: 100 },
}

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cvText, setCvText] = useState('')
  const [cvPdfBase64, setCvPdfBase64] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'confirm'>('upload')
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [progress, setProgress] = useState(0)

  // Smooth progress animation — creeps toward the phase target
  useEffect(() => {
    if (uploadPhase === 'idle') { setProgress(0); return }
    const target = PHASE_CONFIG[uploadPhase].target
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= target) { clearInterval(timer); return target }
        // Fast at first, slows as it approaches target
        const step = Math.max(0.5, (target - prev) * 0.08)
        return Math.min(prev + step, target)
      })
    }, 80)
    return () => clearInterval(timer)
  }, [uploadPhase])

  const profile = trpc.profile.get.useQuery()
  const upsertProfile = trpc.profile.upsert.useMutation({
    onSuccess: () => {
      toast.success('Profile saved')
      router.push('/discover')
    },
    onError: (e) => toast.error(e.message),
  })

  const handleFile = useCallback(async (file: File) => {
    if (!file) return
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.type) && !file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
      toast.error("We couldn't read that file. Try a PDF or Word doc under 5MB.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Keep it under 5MB.')
      return
    }

    setUploading(true)
    setFileName(file.name)
    setUploadPhase('reading')
    try {
      // Read PDF as base64 for attachment (only for PDF files)
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)
        setCvPdfBase64(base64)
      } else {
        setCvPdfBase64(null)
      }

      setUploadPhase('uploading')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/cv/parse', { method: 'POST', body: formData })

      setUploadPhase('parsing')
      const data = await res.json() as { cvText?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Parse failed')
      if (data.cvText) {
        setUploadPhase('done')
        setCvText(data.cvText)
        setStep('confirm')
        toast.success('Resume imported successfully.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parse failed'
      toast.error(message)
      setFileName(null)
      setCvPdfBase64(null)
    } finally {
      setUploading(false)
      // Reset phase after a brief delay so "Done!" is visible
      setTimeout(() => setUploadPhase('idle'), 1200)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) void handleFile(file)
    },
    [handleFile]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile]
  )

  const handleSave = () => {
    if (!cvText && !profile.data?.cvText) {
      toast.error('Your profile needs a few things before we can apply. Add your CV text.')
      return
    }
    upsertProfile.mutate({
      cvText: cvText || undefined,
      cvPdfBase64: cvPdfBase64 || undefined,
    })
  }

  const hasExistingCv = !!(profile.data?.cvPdfBase64 || profile.data?.cvText)
  const hasExistingPdf = !!profile.data?.cvPdfBase64
  const [showReplace, setShowReplace] = useState(false)

  // If user has a CV and hasn't started replacing, show the existing CV view
  const showExistingCv = hasExistingCv && !showReplace && !fileName && !cvText

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <StepIndicator currentStep={1} />

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {showExistingCv ? 'Your CV is ready.' : 'Start with what you\u0027ve got.'}
            </CardTitle>
            <CardDescription>
              {showExistingCv
                ? 'This is the CV we\u0027ll use for your applications. You can continue or upload a new version.'
                : 'Upload your resume or paste your CV. AutoApply learns your experience, skills, and career trajectory so every application speaks your language.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {showExistingCv ? (
              <>
                {/* Existing CV preview */}
                {hasExistingPdf ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-green-100 text-green-700 border-green-300">
                        <CheckCircle className="h-3 w-3 mr-1" /> CV Uploaded
                      </Badge>
                    </div>
                    <iframe
                      src={`data:application/pdf;base64,${profile.data!.cvPdfBase64}`}
                      className="w-full rounded-md border"
                      style={{ height: '400px' }}
                      title="Your CV"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Badge className="bg-green-100 text-green-700 border-green-300">
                      <CheckCircle className="h-3 w-3 mr-1" /> CV Saved
                    </Badge>
                    <div className="rounded-md border bg-muted/50 p-4 max-h-[300px] overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
                        {profile.data!.cvText!.slice(0, 1500)}
                        {(profile.data!.cvText!.length ?? 0) > 1500 && '...'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    size="lg"
                    onClick={() => router.push('/discover')}
                  >
                    Use This CV & Continue <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setShowReplace(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" /> Replace
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* File Upload Zone */}
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : fileName
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3 w-full max-w-xs mx-auto">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <div className="w-full space-y-1.5">
                        <Progress value={progress} className="h-2" />
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">
                            {uploadPhase !== 'idle' ? PHASE_CONFIG[uploadPhase].label : 'Starting...'}
                          </p>
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground/60">{fileName}</p>
                    </div>
                  ) : fileName ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle className="h-8 w-8 text-green-500" />
                      <p className="text-sm font-medium">{fileName}</p>
                      <p className="text-xs text-muted-foreground">Click to replace</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="font-medium">Import Resume</p>
                      <p className="text-sm text-muted-foreground">PDF or Word doc · drag & drop or click</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or paste your CV below</span>
                  <Separator className="flex-1" />
                </div>

                {/* CV Text Paste */}
                <div className="space-y-2">
                  <Label htmlFor="cv-text">
                    <FileText className="inline h-4 w-4 mr-1" />
                    CV / Resume Text
                  </Label>
                  <Textarea
                    id="cv-text"
                    placeholder="Paste your CV text here..."
                    className="min-h-[160px]"
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    size="lg"
                    onClick={handleSave}
                    disabled={upsertProfile.isPending || uploading}
                  >
                    {upsertProfile.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <>Save & Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                  {hasExistingCv && (
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={() => { setShowReplace(false); setFileName(null); setCvText('') }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                {step === 'confirm' && (
                  <p className="text-xs text-center text-muted-foreground">
                    CV parsed. Review and continue.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
