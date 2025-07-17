import Link from 'next/link'
import { Check, X, Sparkles, ArrowRight, Zap, Rocket } from 'lucide-react'
import {
  FREE_TIER,
  STARTER_TIER,
  PRO_TIER,
  POWER_TIER,
  TIER_PRICES_USD,
  type TierLimits,
} from '@/lib/tier-limits'

export const metadata = {
  title: 'Pricing — AutoApply',
  description:
    'Four plans, no surprises. Start free, upgrade to Starter, Pro, or Power as your search scales.',
}

type PlanMeta = {
  id: 'FREE' | 'STARTER' | 'PRO' | 'POWER'
  name: string
  price: number
  tagline: string
  limits: TierLimits
  ctaHref: string
  ctaLabel: string
  accent?: 'highlight'
  icon?: React.ReactNode
}

const PLANS: PlanMeta[] = [
  {
    id: 'FREE',
    name: 'Free',
    price: TIER_PRICES_USD.FREE,
    tagline: 'Kick the tires. Enough to land a few replies.',
    limits: FREE_TIER,
    ctaHref: '/signup',
    ctaLabel: 'Get started free',
  },
  {
    id: 'STARTER',
    name: 'Starter',
    price: TIER_PRICES_USD.STARTER,
    tagline: 'For focused job hunts — a few dozen well-targeted emails.',
    limits: STARTER_TIER,
    ctaHref: '/signup?plan=starter',
    ctaLabel: 'Start Starter',
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: TIER_PRICES_USD.PRO,
    tagline: 'Serious search. A/B testing and multi-stage follow-ups.',
    limits: PRO_TIER,
    ctaHref: '/signup?plan=pro',
    ctaLabel: 'Start with Pro',
    accent: 'highlight',
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  {
    id: 'POWER',
    name: 'Power',
    price: TIER_PRICES_USD.POWER,
    tagline: 'Volume outreach with CV tailoring and priority support.',
    limits: POWER_TIER,
    ctaHref: '/signup?plan=power',
    ctaLabel: 'Go Power',
    icon: <Rocket className="h-3.5 w-3.5" />,
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/50 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Pricing that grows with your search
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade when you need more volume, A/B tests, or follow-ups. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            All plans include: Gmail-native sending · Mapbox coverage map · CV parsing ·
            Claude-powered email generation · Open tracking · Reply detection · Interview pipeline
          </p>
        </div>
      </section>

      {/* Compare table */}
      <section className="pb-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-center mb-8">Compare plans</h2>
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="text-center px-4 py-3">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Monthly price" values={PLANS.map((p) => (p.price === 0 ? 'Free' : `$${p.price}`))} />
                <Row label="Campaigns" values={PLANS.map((p) => p.limits.maxCampaigns)} />
                <Row label="Emails / month" values={PLANS.map((p) => p.limits.emailsPerMonth)} />
                <Row label="AI generations / month" values={PLANS.map((p) => p.limits.aiGenerationsPerMonth)} />
                <Row label="Discoveries / month" values={PLANS.map((p) => p.limits.discoveriesPerMonth)} />
                <Row label="Companies / discovery" values={PLANS.map((p) => p.limits.companiesPerDiscovery)} />
                <Row label="Email verifications / month" values={PLANS.map((p) => p.limits.hunterRequestsPerMonth)} />
                <Row label="Auto follow-ups" values={PLANS.map((p) => (p.limits.followupsEnabled ? `Up to ${p.limits.maxFollowUpSequences}` : false))} />
                <Row label="A/B testing" values={PLANS.map((p) => p.limits.abTestingEnabled)} />
                <Row label="CV tailoring per company" values={PLANS.map((p) => p.limits.cvTailoringEnabled)} />
                <Row label="Priority support" values={PLANS.map((p) => p.limits.prioritySupport)} />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24 border-t border-border/60 bg-muted/20">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-center mb-12">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            <Faq
              q="Can I switch plans anytime?"
              a="Yes — upgrade or downgrade from the billing portal. Upgrades take effect immediately; downgrades apply at the next billing period so you keep paid features until then."
            />
            <Faq
              q="What happens when I hit a limit?"
              a="Emails or verifications that would exceed the cap are skipped (not sent) with a clear message in the review panel. Upgrade and the same draft sends on the next run — nothing is lost."
            />
            <Faq
              q="Do my emails come from AutoApply or my own address?"
              a="Your own Gmail address. We send via the Gmail API using your OAuth token, so recipients see your real email and replies land in your real inbox. This protects your sender reputation."
            />
            <Faq
              q="Is my data private?"
              a="Your CV, campaigns, and emails are visible only to your account. We never sell, share, or use your data to train models. The app is open-source — you can self-host if you want total control."
            />
            <Faq
              q="How does the AI know what to write?"
              a="We parse your CV once, then for each company we feed Claude your background plus the role and any context from the job APIs. The email is tailored, not a template. You can regenerate any draft you don't love."
            />
            <Faq
              q="What payment methods do you accept?"
              a="All major credit cards via Stripe. We don't store card details — Stripe handles all payment data."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to start?</h2>
          <p className="mt-3 text-muted-foreground">
            Sign up with Google in one click. No credit card required for Free.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
          >
            Create free account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}

function PlanCard({ plan }: { plan: PlanMeta }) {
  const isHighlight = plan.accent === 'highlight'
  return (
    <div
      className={`rounded-2xl bg-card p-6 flex flex-col relative ${
        isHighlight
          ? 'border-2 border-primary shadow-lg'
          : 'border border-border/60'
      }`}
    >
      {isHighlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium whitespace-nowrap">
          Most popular
        </div>
      )}
      <div className="flex-1">
        <div
          className={`text-sm font-medium flex items-center gap-1.5 ${
            isHighlight ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {plan.icon}
          {plan.name}
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight">
            {plan.price === 0 ? '$0' : `$${plan.price}`}
          </span>
          <span className="text-muted-foreground text-sm">/month</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{plan.tagline}</p>

        <ul className="mt-6 space-y-2.5">
          <Feat included>{plan.limits.maxCampaigns} campaigns</Feat>
          <Feat included highlight={isHighlight}>
            {plan.limits.emailsPerMonth} emails / month
          </Feat>
          <Feat included highlight={isHighlight}>
            {plan.limits.aiGenerationsPerMonth} AI generations / month
          </Feat>
          <Feat included>{plan.limits.discoveriesPerMonth} discoveries / month</Feat>
          <Feat included>
            {plan.limits.hunterRequestsPerMonth} email verifications / month
          </Feat>
          <Feat included={plan.limits.followupsEnabled}>
            {plan.limits.followupsEnabled
              ? `Auto follow-ups (up to ${plan.limits.maxFollowUpSequences})`
              : 'Auto follow-ups'}
          </Feat>
          <Feat included={plan.limits.abTestingEnabled}>A/B testing</Feat>
          <Feat included={plan.limits.cvTailoringEnabled}>CV tailoring per company</Feat>
          <Feat included={plan.limits.prioritySupport}>Priority support</Feat>
        </ul>
      </div>
      <Link
        href={plan.ctaHref}
        className={`mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm transition-opacity ${
          isHighlight
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'border border-border hover:bg-accent'
        }`}
      >
        {plan.ctaLabel}
        {isHighlight && <ArrowRight className="h-4 w-4" />}
      </Link>
    </div>
  )
}

function Feat({
  children,
  included,
  highlight,
}: {
  children: React.ReactNode
  included?: boolean
  highlight?: boolean
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {included ? (
        <Check
          className={`h-4 w-4 mt-0.5 flex-shrink-0 ${highlight ? 'text-primary' : 'text-green-600'}`}
        />
      ) : (
        <X className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground/40" />
      )}
      <span
        className={
          included
            ? highlight
              ? 'font-medium'
              : ''
            : 'text-muted-foreground/60 line-through decoration-muted-foreground/30'
        }
      >
        {children}
      </span>
    </li>
  )
}

function Row({
  label,
  values,
}: {
  label: string
  values: Array<number | string | boolean>
}) {
  return (
    <tr className="border-t">
      <td className="px-4 py-3 text-left font-medium">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-3 text-center">
          {typeof v === 'boolean' ? (
            v ? (
              <Check className="h-4 w-4 text-green-600 mx-auto" />
            ) : (
              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
            )
          ) : (
            <span className="tabular-nums">{typeof v === 'number' ? v.toLocaleString() : v}</span>
          )}
        </td>
      ))}
    </tr>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <h3 className="font-medium">{q}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a}</p>
    </div>
  )
}
