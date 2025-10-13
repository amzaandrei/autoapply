import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma, withDbRetry } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Building2,
  Sparkles,
  Plus,
  ArrowRight,
  MailCheck,
  FileText,
  Eye,
  MessageSquare,
} from 'lucide-react'
import CampaignList from '@/components/CampaignList'
import { ContactedCompanies } from '@/components/ContactedCompanies'
import { TemplatesSection } from '@/components/TemplatesSection'
import { PageTransition, Stagger } from '@/components/Motion'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [campaigns, profile, emailStats, contactedCompanies, sentByCampaign] = await withDbRetry(
    () =>
      Promise.all([
        prisma.campaign.findMany({
          where: { userId: session.user.id },
          include: { _count: { select: { companies: true, emails: true } } },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.userProfile.findUnique({ where: { userId: session.user.id } }),
        prisma.generatedEmail.groupBy({
          by: ['status'],
          where: { campaign: { userId: session.user.id } },
          _count: true,
        }),
        prisma.generatedEmail.findMany({
          where: {
            campaign: { userId: session.user.id },
            status: { in: ['SENT', 'OPENED', 'REPLIED', 'BOUNCED'] },
          },
          select: {
            status: true,
            sentAt: true,
            openedAt: true,
            repliedAt: true,
            openCount: true,
            company: { select: { name: true, contactEmail: true, industry: true } },
            campaign: { select: { name: true } },
          },
          orderBy: { sentAt: 'desc' },
        }),
        prisma.generatedEmail.findMany({
          where: {
            campaign: { userId: session.user.id },
            sentAt: { not: null },
          },
          select: { campaignId: true, sentAt: true },
        }),
      ]),
  )

  // Build { campaignId: [YYYY-MM-DD, ...] } in the user's browser TZ on the client.
  // For the initial SSR default, we pass raw ISO strings and let the client bucket.
  const sentDatesByCampaign: Record<string, string[]> = {}
  for (const row of sentByCampaign) {
    if (!row.sentAt) continue
    const list = sentDatesByCampaign[row.campaignId] ?? (sentDatesByCampaign[row.campaignId] = [])
    list.push(row.sentAt.toISOString())
  }

  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0)
  const statusCounts = Object.fromEntries(emailStats.map((s) => [s.status, s._count]))
  const sentCount = (statusCounts.SENT ?? 0) + (statusCounts.OPENED ?? 0) + (statusCounts.REPLIED ?? 0)
  const openedCount = (statusCounts.OPENED ?? 0) + (statusCounts.REPLIED ?? 0)
  const repliedCount = statusCounts.REPLIED ?? 0
  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0
  const latestCampaignId = campaigns[0]?.id

  return (
    <div className="min-h-screen bg-background">
      <PageTransition>
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
          <Stagger className="grid grid-cols-5 gap-3 mb-10">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2.5">
                  <MailCheck className="h-6 w-6 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-bold">{sentCount}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2.5">
                  <Eye className="h-6 w-6 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-xl font-bold">{openRate}%</p>
                    <p className="text-xs text-muted-foreground">Open rate ({openedCount})</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="h-6 w-6 text-green-500 shrink-0" />
                  <div>
                    <p className="text-xl font-bold">{replyRate}%</p>
                    <p className="text-xs text-muted-foreground">Reply rate ({repliedCount})</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-6 w-6 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-bold">
                      {campaigns.reduce((sum, c) => sum + c._count.companies, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Companies</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-6 w-6 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-bold">{campaigns.length}</p>
                    <p className="text-xs text-muted-foreground">Campaigns</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Stagger>
        )}

        {/* Coverage CTA */}
        {totalSent > 0 && (
          <Link href="/coverage" className="block mb-6">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="py-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500/20 to-emerald-500/20 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Coverage Map</p>
                  <p className="text-xs text-muted-foreground">See where you've applied and which tech hubs you're missing</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Templates */}
        <TemplatesSection />

        {/* Contacted companies */}
        {contactedCompanies.length > 0 && (
          <div className="mb-8">
            <ContactedCompanies companies={contactedCompanies.map(c => ({
              ...c,
              sentAt: c.sentAt?.toISOString() ?? null,
              openedAt: c.openedAt?.toISOString() ?? null,
              repliedAt: c.repliedAt?.toISOString() ?? null,
            }))} />
          </div>
        )}

        {/* Recent campaigns */}
        {campaigns.length > 0 ? (
          // CampaignList has its own StaggerItem-based entrance
          <CampaignList campaigns={campaigns} sentDatesByCampaign={sentDatesByCampaign} />
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="max-w-2xl mx-auto text-center">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h3 className="text-xl font-semibold">Welcome to AutoApply</h3>
                <p className="text-muted-foreground text-sm mt-2">
                  Let&apos;s land you interviews. Here&apos;s how it works:
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 max-w-3xl mx-auto">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">1</div>
                    <p className="font-medium text-sm">Upload your CV</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-8">AI reads your experience and skills.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">2</div>
                    <p className="font-medium text-sm">Discover companies</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-8">We find real live job postings for you.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">3</div>
                    <p className="font-medium text-sm">Send applications</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-8">Personalized emails, tracked replies.</p>
                </div>
              </div>
              <div className="flex justify-center gap-3 mt-8">
                <Link href="/upload">
                  <Button size="lg">
                    {profile?.cvText ? 'Start Your First Campaign' : 'Upload CV'} <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                {profile?.cvText && (
                  <Link href="/discover">
                    <Button size="lg" variant="outline">
                      Skip to Discover
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </PageTransition>
    </div>
  )
}
