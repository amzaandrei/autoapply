import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { TemplatesManager } from '@/components/TemplatesManager'

export default async function TemplatesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="mb-2 -ml-3">
                <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">Templates &amp; Autopilot</h1>
            <p className="text-muted-foreground mt-1">
              Let AutoApply run saved campaigns on your behalf — discover jobs
              and generate emails on a schedule, with or without your approval.
            </p>
          </div>
          <Link href="/discover">
            <Button variant="outline">Create template</Button>
          </Link>
        </div>

        <TemplatesManager />
      </div>
    </div>
  )
}
