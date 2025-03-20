'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Upload, FileText, Loader2, CheckCircle, ArrowRight } from 'lucide-react'
import { StepIndicator } from '@/components/StepIndicator'
import Link from 'next/link'

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [jobTitle, setJobTitle] = useState('')
  const [region, setRegion] = useState('')
  const [cvText, setCvText] = useState('')
  const [cvPdfBase64, setCvPdfBase64] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'confirm'>('upload')

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
    try {
      // Read PDF as base64 for attachment (only for PDF files)
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        setCvPdfBase64(base64)
      } else {
        setCvPdfBase64(null)
      }

      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/cv/parse', { method: 'POST', body: formData })
      const data = await res.json() as { cvText?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Parse failed')
      if (data.cvText) {
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
      jobTitle: jobTitle || undefined,
      cvPdfBase64: cvPdfBase64 || undefined,
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Dashboard</Link>
        <StepIndicator currentStep={1} />

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Start with what you&apos;ve got.</CardTitle>
            <CardDescription>
              Upload your resume or paste your CV. AutoApply learns your experience, skills, and
              career trajectory so every application speaks your language.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing your CV with AI...</p>
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

            <Separator />

            {/* Job Targets */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="job-title">Target Job Title</Label>
                <Input
                  id="job-title"
                  placeholder="e.g. Senior Software Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Target Region</Label>
                <Input
                  id="region"
                  placeholder="e.g. London, Remote, NYC"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
            </div>

            {profile.data?.cvText && !cvText && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  You have a saved CV. Continue or upload a new one.
                </p>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleSave}
              disabled={upsertProfile.isPending || uploading}
            >
              {upsertProfile.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  Set My Targets <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>

            {step === 'confirm' && (
              <p className="text-xs text-center text-muted-foreground">
                CV parsed. Add your target job title and region, then continue.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
