'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { PageTransition } from '@/components/Motion'

interface ProfileData {
  id: string
  name: string | null
  email: string
  image: string | null
  createdAt: string
  profile: {
    id: string
    cvUrl: string | null
    cvText: string | null
    cvPdfBase64: string | null
    jobTitle: string | null
    skills: string[]
    bio: string | null
    linkedIn: string | null
    portfolio: string | null
    emailTemplate: string | null
    useEmailTemplate: boolean
    signatureName: string | null
    signaturePhone: string | null
    signatureAddress: string | null
    updatedAt: string
  } | null
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showReplaceUpload, setShowReplaceUpload] = useState(false)
  const [replacingCv, setReplacingCv] = useState(false)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)

  // Editable form state
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [bio, setBio] = useState('')
  const [linkedIn, setLinkedIn] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [emailTemplate, setEmailTemplate] = useState('')
  const [useEmailTemplate, setUseEmailTemplate] = useState(false)
  const [signatureName, setSignatureName] = useState('')
  const [signaturePhone, setSignaturePhone] = useState('')
  const [signatureAddress, setSignatureAddress] = useState('')

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d: ProfileData) => {
        setData(d)
        setName(d.name ?? '')
        setImage(d.image ?? '')
        setJobTitle(d.profile?.jobTitle ?? '')
        setBio(d.profile?.bio ?? '')
        setLinkedIn(d.profile?.linkedIn ?? '')
        setPortfolio(d.profile?.portfolio ?? '')
        setSkillsInput((d.profile?.skills ?? []).join(', '))
        setEmailTemplate(d.profile?.emailTemplate ?? '')
        setUseEmailTemplate(d.profile?.useEmailTemplate ?? false)
        setSignatureName(d.profile?.signatureName || d.name || '')
        setSignaturePhone(d.profile?.signaturePhone ?? '')
        setSignatureAddress(d.profile?.signatureAddress ?? '')
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  async function handleReplaceCV(file: File) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.type) && !file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
      toast.error("Try a PDF or Word doc under 5MB.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Keep it under 5MB.')
      return
    }
    setReplacingCv(true)
    try {
      let cvPdfBase64: string | undefined
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        cvPdfBase64 = btoa(binary)
      }
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/cv/parse', { method: 'POST', body: formData })
      const parsed = await res.json() as { cvText?: string; error?: string }
      if (!res.ok) throw new Error(parsed.error ?? 'Parse failed')

      const patchRes = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: parsed.cvText, cvPdfBase64 }),
      })
      if (!patchRes.ok) throw new Error('Failed to save CV')
      const updated: ProfileData = await patchRes.json()
      setData(updated)
      setShowReplaceUpload(false)
      toast.success('CV replaced successfully.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to replace CV')
    } finally {
      setReplacingCv(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const skills = skillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, image, jobTitle, bio, linkedIn, portfolio, skills,
          emailTemplate, useEmailTemplate, signatureName, signaturePhone, signatureAddress,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Save failed')
      }

      const updated: ProfileData = await res.json()
      setData(updated)
      setSkillsInput((updated.profile?.skills ?? []).join(', '))
      toast.success('Profile saved!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-muted-foreground text-sm">Loading profile…</div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-destructive text-sm">Could not load profile.</div>
      </main>
    )
  }

  const cvFilename = data.profile?.cvUrl?.split('/').pop() ?? null

  return (
    <PageTransition>
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Keep your info up to date so AutoApply can craft the best emails for you.
        </p>
      </div>

      {/* Personal Info */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Info</CardTitle>
          <CardDescription>Your name and avatar shown across AutoApply.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Read-only email */}
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={data.email} readOnly className="bg-muted cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="image">Profile Image URL</Label>
            <div className="flex items-center gap-3">
              {image && (
                <img
                  src={image}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover shrink-0 border"
                />
              )}
              <Input
                id="image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="bio">Bio / Summary</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="A short professional summary…"
            />
          </div>
        </CardContent>
      </Card>

      {/* CV / Resume */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your CV</CardTitle>
              <CardDescription>
                Your uploaded CV used when generating application emails.
              </CardDescription>
            </div>
            {data.profile?.cvPdfBase64 && (
              <Badge className="bg-green-100 text-green-700 border-green-300 shrink-0">
                ✓ Uploaded
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.profile?.cvPdfBase64 ? (
            <>
              <iframe
                src={`data:application/pdf;base64,${data.profile.cvPdfBase64}`}
                className="w-full rounded-md border"
                style={{ height: '500px' }}
                title="CV Preview"
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowReplaceUpload((v) => !v)
                    if (!showReplaceUpload) setTimeout(() => replaceFileInputRef.current?.click(), 50)
                  }}
                  disabled={replacingCv}
                >
                  {replacingCv ? 'Uploading…' : 'Replace CV'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = `data:application/pdf;base64,${data.profile!.cvPdfBase64}`
                    link.download = cvFilename ?? 'cv.pdf'
                    link.click()
                  }}
                >
                  Download CV
                </Button>
              </div>
              <input
                ref={replaceFileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleReplaceCV(file)
                  e.target.value = ''
                }}
              />
            </>
          ) : (
            <>
              {cvFilename && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">📄 {cvFilename}</Badge>
                </div>
              )}
              {data.profile?.cvText ? (
                <div className="space-y-1">
                  <Label>Extracted CV Text</Label>
                  <Textarea
                    value={data.profile.cvText}
                    readOnly
                    rows={10}
                    className="bg-muted cursor-not-allowed font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    To update your CV, go to the{' '}
                    <a href="/upload" className="underline hover:text-foreground">
                      Upload page
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No CV uploaded yet.{' '}
                  <a href="/upload" className="underline hover:text-foreground">
                    Upload your CV
                  </a>{' '}
                  to get started.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Job Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Job Preferences</CardTitle>
          <CardDescription>
            Tell AutoApply what you&apos;re looking for so it can target the right opportunities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="jobTitle">Target Job Title</Label>
            <Input
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Product Designer"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="skills">Skills</Label>
            <Input
              id="skills"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="React, TypeScript, Figma, …"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of your skills.</p>
            {skillsInput && (
              <div className="flex flex-wrap gap-1 pt-1">
                {skillsInput
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => (
                    <Badge key={s} variant="outline" className="text-xs">
                      {s}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-1">
            <Label htmlFor="linkedIn">LinkedIn URL</Label>
            <Input
              id="linkedIn"
              value={linkedIn}
              onChange={(e) => setLinkedIn(e.target.value)}
              placeholder="https://linkedin.com/in/…"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="portfolio">Portfolio / Website</Label>
            <Input
              id="portfolio"
              value={portfolio}
              onChange={(e) => setPortfolio(e.target.value)}
              placeholder="https://yoursite.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email Settings</CardTitle>
          <CardDescription>
            Configure your email template and signature for outreach emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="useEmailTemplate">Use my own email template instead of AI</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, your custom template is used instead of AI-generated content.
              </p>
            </div>
            <Switch
              id="useEmailTemplate"
              checked={useEmailTemplate}
              onCheckedChange={setUseEmailTemplate}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="emailTemplate">Email Blueprint</Label>
            <Textarea
              id="emailTemplate"
              value={emailTemplate}
              onChange={(e) => setEmailTemplate(e.target.value)}
              rows={8}
              disabled={!useEmailTemplate}
              className={!useEmailTemplate ? 'opacity-50 cursor-not-allowed' : ''}
              placeholder={`Hi,\n\nI'm reaching out about opportunities at {{company}}. I'm very interested in a {{position}} role and believe my background is a strong match.\n\n[Your message here]\n\nLooking forward to hearing from you.`}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{'{{company}}'}</code> and{' '}
              <code className="bg-muted px-1 rounded">{'{{position}}'}</code> as placeholders — they'll
              be replaced automatically when generating emails.
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Email Signature</Label>
            <p className="text-xs text-muted-foreground -mt-2">
              Appended to every outreach email automatically.
            </p>

            <div className="space-y-1">
              <Label htmlFor="signatureName">Full Name</Label>
              <Input
                id="signatureName"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="signaturePhone">Phone</Label>
              <Input
                id="signaturePhone"
                value={signaturePhone}
                onChange={(e) => setSignaturePhone(e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="signatureAddress">Address</Label>
              <Input
                id="signatureAddress"
                value={signatureAddress}
                onChange={(e) => setSignatureAddress(e.target.value)}
                placeholder="City, Country"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? 'Saving…' : 'Save Profile'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Member since {new Date(data.createdAt).toLocaleDateString()}
      </p>
    </main>
    </PageTransition>
  )
}
