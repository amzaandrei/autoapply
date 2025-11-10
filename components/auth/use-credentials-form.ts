'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

/**
 * Shared state machine for the email/password forms on /login and /signup.
 * Both pages collect the same fields and ultimately call `signIn('credentials', …)`
 * with redirect={false}, so the form state and the redirect handling live here.
 */
export function useCredentialsForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function signInAndRedirect(failureMessage: string): Promise<boolean> {
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setError(failureMessage)
      setLoading(false)
      return false
    }
    router.push('/dashboard')
    return true
  }

  return { email, setEmail, password, setPassword, error, setError, loading, setLoading, signInAndRedirect }
}
