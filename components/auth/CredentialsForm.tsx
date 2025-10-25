'use client'

import type { FormEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CredentialsFormProps {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  passwordPlaceholder?: string
  error: string
  loading: boolean
  submitLabel: string
  loadingLabel: string
  onSubmit: (e: FormEvent) => void
  beforeEmail?: ReactNode
}

export function CredentialsForm({
  email,
  setEmail,
  password,
  setPassword,
  passwordPlaceholder = 'Password',
  error,
  loading,
  submitLabel,
  loadingLabel,
  onSubmit,
  beforeEmail,
}: CredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {beforeEmail}
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        type="password"
        placeholder={passwordPlaceholder}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? loadingLabel : submitLabel}
      </Button>
    </form>
  )
}
