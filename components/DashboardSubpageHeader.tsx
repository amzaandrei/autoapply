'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DashboardSubpageHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const router = useRouter()
  return (
    <>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => router.push('/dashboard')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
      </div>
    </>
  )
}
