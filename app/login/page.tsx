'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { CredentialsForm } from '@/components/auth/CredentialsForm'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <AuthCard
      title="AutoApply"
      description="Sign in to your account"
      footer={
        <p className="text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      <CredentialsForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        error={error}
        loading={loading}
        submitLabel="Sign in"
        loadingLabel="Signing in..."
        onSubmit={handleSubmit}
      />
      <OAuthButtons />
    </AuthCard>
  )
}
