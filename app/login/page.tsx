'use client'

import Link from 'next/link'
import { AuthCard } from '@/components/auth/AuthCard'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { CredentialsForm } from '@/components/auth/CredentialsForm'
import { useCredentialsForm } from '@/components/auth/use-credentials-form'

export default function LoginPage() {
  const form = useCredentialsForm()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    form.setLoading(true)
    form.setError('')
    await form.signInAndRedirect('Invalid email or password')
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
        email={form.email}
        setEmail={form.setEmail}
        password={form.password}
        setPassword={form.setPassword}
        error={form.error}
        loading={form.loading}
        submitLabel="Sign in"
        loadingLabel="Signing in..."
        onSubmit={handleSubmit}
      />
      <OAuthButtons />
    </AuthCard>
  )
}
