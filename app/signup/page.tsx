'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/components/auth/AuthCard'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { CredentialsForm } from '@/components/auth/CredentialsForm'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Registration failed')
      setLoading(false)
      return
    }

    const signInResult = await signIn('credentials', { email, password, redirect: false })
    if (signInResult?.error) {
      setError('Account created but sign-in failed. Please sign in manually.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
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
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        passwordPlaceholder="Password (min 8 chars)"
        error={error}
        loading={loading}
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
