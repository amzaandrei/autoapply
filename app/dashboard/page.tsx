import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Upload,
  Building2,
  Sparkles,
  CheckSquare,
  Send,
  Plus,
  ArrowRight,
  MailCheck,
  FileText,
} from 'lucide-react'
import CampaignList from '@/components/CampaignList'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [campaigns, profile] = await Promise.all([
    prisma.campaign.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { companies: true, emails: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.userProfile.findUnique({ where: { userId: session.user.id } }),
  ])

  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0)

  const steps = [
    { step: '1', label: 'Upload CV', href: '/upload', desc: 'Import your resume', icon: Upload, done: !!profile?.cvText },
    { step: '2', label: 'Discover', href: '/discover', desc: 'Find target companies', icon: Building2, done: campaigns.some((c) => c._count.companies > 0) },
    { step: '3', label: 'Generate', href: '/generate', desc: 'AI writes your emails', icon: Sparkles, done: campaigns.some((c) => c._count.emails > 0) },
    { step: '4', label: 'Review', href: '/review', desc: 'Edit & approve', icon: CheckSquare, done: false },
    { step: '5', label: 'Send', href: '/send', desc: 'Send via Gmail', icon: Send, done: totalSent > 0 },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold">AutoApply</h1>
            <p className="text-muted-foreground mt-1">
              Apply everywhere. Interview anywhere.
            </p>
          </div>
          <Link href="/upload">
            <Button size="lg">
              <Plus className="h-4 w-4 mr-2" /> New Campaign
            </Button>
          </Link>
        </div>

        {/* Stats */}
        {totalSent > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-10">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MailCheck className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalSent}</p>
                    <p className="text-sm text-muted-foreground">Applications sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">
                      {campaigns.reduce((sum, c) => sum + c._count.companies, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Companies targeted</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{campaigns.length}</p>
                    <p className="text-sm text-muted-foreground">Active campaigns</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 5-step pipeline */}
        <div className="grid grid-cols-5 gap-3 mb-10">
          {steps.map((s) => {
            const Icon = s.icon
            return (
              <Link key={s.step} href={s.href}>
                <Card className="hover:border-primary transition-colors cursor-pointer h-full group">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1">
                      Step {s.step}
                      {s.done && <span className="text-green-500 text-xs">✓</span>}
                    </CardDescription>
                    <CardTitle className="text-base flex items-center gap-1.5">
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      {s.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        {/* Recent campaigns */}
        {campaigns.length > 0 ? (
          <CampaignList campaigns={campaigns} />
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary opacity-50" />
              <h3 className="text-lg font-semibold">No campaigns yet.</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">
                Start by uploading your CV.
              </p>
              <Link href="/upload" className="inline-block mt-6">
                <Button size="lg">
                  Upload CV <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
