'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
          <h2>Application error</h2>
          <p>A serious error occurred. Please refresh the page.</p>
          {error.digest && <p style={{ fontFamily: 'monospace', fontSize: 12 }}>ref: {error.digest}</p>}
        </div>
      </body>
    </html>
  )
}
