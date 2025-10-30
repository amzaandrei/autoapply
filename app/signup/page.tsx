'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/components/auth/AuthCard'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { CredentialsForm } from '@/components/auth/CredentialsForm'
import { useCredentialsForm } from '@/components/auth/use-credentials-form'

export default function SignupPage() {
  const [name, setName] = useState('')
  const form = useCredentialsForm()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    form.setLoading(true)
    form.setError('')

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: form.email, password: form.password }),
    })

    if (!res.ok) {
      const data = await res.json()
      form.setError(data.error ?? 'Registration failed')
      form.setLoading(false)
      return
    }

    await form.signInAndRedirect('Account created but sign-in failed. Please sign in manually.')
  }

  return (
    <AuthCard
      title="Create account"
      description="Start automating your job applications"
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <CredentialsForm
        email={form.email}
        setEmail={form.setEmail}
        password={form.password}
        setPassword={form.setPassword}
        passwordPlaceholder="Password (min 8 chars)"
        error={form.error}
        loading={form.loading}
        submitLabel="Create account"
        loadingLabel="Creating account..."
        onSubmit={handleSubmit}
        beforeEmail={
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        }
      />
      <OAuthButtons />
    </AuthCard>
  )
}
