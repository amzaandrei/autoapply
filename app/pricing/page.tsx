import Link from 'next/link'
import { Check, X, Sparkles, ArrowRight } from 'lucide-react'
import { FREE_TIER, PRO_TIER } from '@/lib/tier-limits'

export const metadata = {
  title: 'Pricing — AutoApply',
  description: 'Start free. Upgrade to Pro for unlimited campaigns, emails, and AI generations.',
}

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
            Pricing that grows with you
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. Pay only when you're seeing replies. Cancel anytime, no questions asked.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6 md:gap-4">
            {/* Free */}
            <div className="rounded-2xl border border-border/60 bg-card p-8 flex flex-col">
              <div className="flex-1">
                <div className="text-sm font-medium text-muted-foreground">Free</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Enough to validate the product and land a few replies. Forever free.
                </p>

                <ul className="mt-8 space-y-3">
                  <Feature included>Up to {FREE_TIER.maxCampaigns} campaigns</Feature>
                  <Feature included>{FREE_TIER.emailsPerMonth} emails per month</Feature>
                  <Feature included>{FREE_TIER.aiGenerationsPerMonth} AI generations per month</Feature>
                  <Feature included>{FREE_TIER.discoveriesPerHour} discoveries per hour</Feature>
                  <Feature included>Multi-source company discovery</Feature>
                  <Feature included>Coverage heat map</Feature>
                  <Feature included>Open &amp; reply tracking</Feature>
                  <Feature>A/B testing</Feature>
                  <Feature>Auto follow-ups</Feature>
                  <Feature>Priority support</Feature>
                </ul>
              </div>
              <Link
                href="/signup"
                className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-border hover:bg-accent transition-colors font-medium"
              >
                Get started free
              </Link>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border-2 border-primary bg-card p-8 flex flex-col relative shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                Most popular
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-primary flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Pro
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight">$19</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  For serious job seekers. Unlock everything, send as much as you need.
                </p>

                <ul className="mt-8 space-y-3">
                  <Feature included highlight>Unlimited campaigns</Feature>
                  <Feature included highlight>Unlimited emails</Feature>
                  <Feature included highlight>Unlimited AI generations</Feature>
                  <Feature included highlight>
                    {PRO_TIER.discoveriesPerHour} discoveries per hour
                  </Feature>
                  <Feature included>Multi-source company discovery</Feature>
                  <Feature included>Coverage heat map</Feature>
                  <Feature included>Open &amp; reply tracking</Feature>
                  <Feature included highlight>A/B testing</Feature>
                  <Feature included highlight>Auto follow-ups (up to 3 sequences)</Feature>
                  <Feature included highlight>Priority support</Feature>
                </ul>
              </div>
              <Link
                href="/signup?plan=pro"
                className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
              >
                Start with Pro
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            All plans include: Gmail-native sending · Mapbox coverage map · CV parsing · Claude-powered email generation · Open tracking · Reply detection · Interview pipeline
          </p>
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
              q="Can I cancel anytime?"
              a="Yes. Cancel from the billing portal and you'll keep Pro features until the end of the current billing period, then drop back to Free."
            />
            <Faq
              q="What happens when I hit the free tier limit?"
              a="Emails that would exceed the cap are skipped (not sent) with a clear message in the review panel. Upgrade to Pro and the same draft sends on the next run — nothing is lost."
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
              a="We parse your CV once, then for each company we feed Claude your background + the role + any context from the job API. The email is tailored, not a template. You can regenerate any draft you don't love."
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
            Sign up with Google in one click. No credit card required.
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

function Feature({
  children,
  included,
  highlight,
}: {
  children: React.ReactNode
  included?: boolean
  highlight?: boolean
}) {
  return (
    <li className="flex items-start gap-3 text-sm">
      {included ? (
        <Check
          className={`h-5 w-5 flex-shrink-0 ${highlight ? 'text-primary' : 'text-green-600'}`}
        />
      ) : (
        <X className="h-5 w-5 flex-shrink-0 text-muted-foreground/40" />
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

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <h3 className="font-medium">{q}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a}</p>
    </div>
  )
}
