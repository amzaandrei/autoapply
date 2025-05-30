// Translate raw error messages into actionable, user-friendly ones.

export function friendlyError(raw: string): { title: string; description?: string } {
  const lower = raw.toLowerCase()

  // Gmail errors
  if (lower.includes('rate limit') || lower.includes('quota exceeded') || lower.includes('429')) {
    return {
      title: 'Gmail rate limit hit',
      description: 'Try again in a few minutes. Gmail limits you to ~500 emails/day.',
    }
  }
  if (lower.includes('invalid_grant') || lower.includes('token expired') || lower.includes('invalid credentials')) {
    return {
      title: 'Gmail connection expired',
      description: 'Reconnect Gmail from the Send page.',
    }
  }
  if (lower.includes('insufficient permission') || lower.includes('403')) {
    return {
      title: 'Gmail permission missing',
      description: 'Reconnect Gmail to grant the required access.',
    }
  }
  if (lower.includes('recipient address rejected') || lower.includes('550') || lower.includes('5.1.1')) {
    return {
      title: 'Email address not found',
      description: 'Use Find Email to search for the real hiring address.',
    }
  }
  if (lower.includes('message too large')) {
    return {
      title: 'Email too large',
      description: 'Your CV attachment may be too big. Try one under 5 MB.',
    }
  }

  // Anthropic errors
  if (lower.includes('anthropic') && lower.includes('rate')) {
    return {
      title: 'AI rate limit',
      description: 'Claude is busy — wait a moment and try again.',
    }
  }
  if (lower.includes('anthropic') && (lower.includes('401') || lower.includes('invalid api key'))) {
    return {
      title: 'AI unavailable',
      description: 'Claude API key issue — contact support.',
    }
  }

  // Prisma / DB errors
  if (lower.includes('prisma') || lower.includes('database')) {
    return {
      title: 'Database error',
      description: 'Something went wrong saving your data. Try again.',
    }
  }

  // Auth errors
  if (lower.includes('unauthorized') || lower.includes('401')) {
    return {
      title: 'Session expired',
      description: 'Sign in again.',
    }
  }

  // Network errors
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('enotfound')) {
    return {
      title: 'Network error',
      description: 'Check your connection and try again.',
    }
  }

  // Fallback — use the original
  return { title: raw }
}
