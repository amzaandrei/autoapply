'use client'

import Link from 'next/link'
import { useRef } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionProps,
} from 'motion/react'
import {
  Sparkles,
  Search,
  Mail,
  BarChart3,
  MapPin,
  Shield,
  Clock,
  ArrowRight,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────
// Motion primitives — respect prefers-reduced-motion globally
// ──────────────────────────────────────────────────────────────────────────

function useMotionSafe() {
  return useReducedMotion()
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'h1' | 'h2' | 'p' | 'span'
}) {
  const reduced = useMotionSafe()
  const M = (motion as any)[Tag] as React.ComponentType<MotionProps & { className?: string }>
  return (
    <M
      className={className}
      initial={reduced ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </M>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection />
      <PricingTeaser />
      <Footer />
    </main>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Hero with parallax background + staggered reveal
// ──────────────────────────────────────────────────────────────────────────

function HeroSection() {
  const ref = useRef<HTMLElement>(null)
  const reduced = useMotionSafe()
  const { scrollY } = useScroll()

  // Background glow drifts slower than foreground (classic parallax)
  const bgY = useTransform(scrollY, [0, 600], [0, 160])
  const bgOpacity = useTransform(scrollY, [0, 400], [0.6, 0.2])

  // Dashboard preview lifts slightly + softens as you scroll past
  const previewY = useTransform(scrollY, [0, 400], [0, -40])
  const previewOpacity = useTransform(scrollY, [0, 700], [1, 0.85])

  return (
    <section ref={ref} className="relative overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={
          reduced
            ? undefined
            : {
                y: bgY,
                opacity: bgOpacity,
                background:
                  'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.18), transparent 60%)',
              }
        }
      />
      {/* Second floating gradient for depth */}
      {!reduced && (
        <motion.div
          aria-hidden
          className="absolute -z-10 h-[600px] w-[600px] rounded-full blur-3xl pointer-events-none"
          style={{
            top: '10%',
            right: '-10%',
            background: 'hsl(var(--primary) / 0.08)',
            y: useTransform(scrollY, [0, 800], [0, -120]),
          }}
        />
      )}

      <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <motion.div
          className="flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto"
          initial={reduced ? false : 'hidden'}
          animate="visible"
          variants={stagger}
        >
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/50 text-xs text-muted-foreground"
          >
            <motion.span
              animate={reduced ? undefined : { rotate: [0, 12, -8, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <Sparkles className="h-3 w-3 text-primary" />
            </motion.span>
            Powered by Claude &amp; real-time job APIs
          </motion.div>

          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl md:text-6xl font-semibold tracking-tight"
          >
            Land your next job <br className="hidden md:block" />
            with{' '}
            <span className="text-primary relative inline-block">
              AI-powered outreach
              {!reduced && (
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-[3px] bg-primary/40 rounded-full"
                  initial={{ scaleX: 0, originX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.8, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl"
          >
            Discover companies that are hiring, generate personalized emails in your voice,
            and track every reply — all from a single dashboard.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col sm:flex-row gap-3 pt-2"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              Start free
              <motion.span
                className="inline-flex"
                initial={false}
                whileHover={reduced ? undefined : { x: 3 }}
              >
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </motion.span>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-border hover:bg-accent transition-colors"
            >
              See pricing
            </Link>
          </motion.div>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-xs text-muted-foreground pt-1"
          >
            No credit card required · 3 campaigns free forever
          </motion.p>
        </motion.div>

        {/* Dashboard preview — parallax lift + scale-in */}
        <motion.div
          className="mt-16 rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden max-w-5xl mx-auto"
          initial={reduced ? false : { opacity: 0, y: 40, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={reduced ? undefined : { y: previewY, opacity: previewOpacity }}
        >
          <div className="border-b border-border/60 px-4 py-3 flex items-center gap-2 bg-muted/30">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
            </div>
            <div className="text-xs text-muted-foreground ml-3">app.autoapply/dashboard</div>
          </div>
          <motion.div
            className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4"
            initial={reduced ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
          >
            <StatTile label="Companies discovered" value="247" trend="+32 today" />
            <StatTile label="Emails sent" value="89" trend="+18 this week" />
            <StatTile label="Replies" value="12" trend="13.5% rate" accent />
            <StatTile label="Interviews" value="4" trend="2 upcoming" />
            <StatTile label="Follow-ups" value="23" trend="auto" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Features grid — stagger-reveal cards
// ──────────────────────────────────────────────────────────────────────────

function FeaturesSection() {
  const reduced = useMotionSafe()
  return (
    <section id="features" className="py-20 md:py-28 border-t border-border/60">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Everything you need to run a serious job search
          </h2>
          <p className="mt-4 text-muted-foreground">
            Stop spraying resumes into the void. Stop babysitting spreadsheets. Let AI do the grunt
            work while you focus on the interviews that actually matter.
          </p>
        </Reveal>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
          initial={reduced ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <FeatureCard
            icon={<Search className="h-5 w-5" />}
            title="Multi-source discovery"
            body="Pull companies that are actively hiring from JSearch, Remotive, Arbeitnow, The Muse, plus AI-curated matches. No scraping, no copy-paste."
          />
          <FeatureCard
            icon={<Mail className="h-5 w-5" />}
            title="AI-generated emails"
            body="Claude writes each email tailored to the company, role, and your CV. Choose concise, balanced, or detailed tone — or A/B test two variants."
          />
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Tracking that works"
            body="Open tracking, reply detection, bounce classification, interview pipeline. Know which emails landed and which companies ghosted."
          />
          <FeatureCard
            icon={<Clock className="h-5 w-5" />}
            title="Auto follow-ups"
            body="3 follow-up sequences on a schedule you control. We skip anyone who already replied and respect the thread so recruiters see one conversation."
          />
          <FeatureCard
            icon={<MapPin className="h-5 w-5" />}
            title="Coverage heat map"
            body="See where you've already applied on a map, and spot untapped tech hubs you're missing. Prevents duplicate outreach across campaigns."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Your Gmail, your reputation"
            body="Emails send from your own Gmail account, not a shared SMTP pool. Real sender reputation, real deliverability, no spoofing."
          />
        </motion.div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// How it works — parallax steps
// ──────────────────────────────────────────────────────────────────────────

function HowItWorksSection() {
  const ref = useRef<HTMLElement>(null)
  const reduced = useMotionSafe()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  // Subtle drift of the section background
  const bgX = useTransform(scrollYProgress, [0, 1], [-40, 40])

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="relative py-20 md:py-28 border-t border-border/60 bg-muted/20 overflow-hidden"
    >
      {!reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            x: bgX,
            background:
              'radial-gradient(circle at 30% 50%, hsl(var(--primary) / 0.06), transparent 50%)',
          }}
        />
      )}
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-4 text-muted-foreground">Three steps from zero to sent emails.</p>
        </Reveal>

        <motion.div
          className="grid md:grid-cols-3 gap-6"
          initial={reduced ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <StepCard
            num="01"
            title="Drop your CV"
            body="Upload a PDF or DOCX. We extract your skills, experience, and tone so every email sounds like you — not like a template."
          />
          <StepCard
            num="02"
            title="Pick a role + region"
            body="Tell us what you're after. Draw a radius on a map. AutoApply finds companies hiring and validates every email address before spending AI tokens."
          />
          <StepCard
            num="03"
            title="Review and send"
            body="Read the drafts, regenerate any you don't love, and hit send. Replies land in a unified inbox. Follow-ups handle themselves."
          />
        </motion.div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Stats — count-up style scale-in on view
// ──────────────────────────────────────────────────────────────────────────

function StatsSection() {
  const reduced = useMotionSafe()
  return (
    <section className="py-16 border-t border-border/60">
      <motion.div
        className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-8 text-center"
        initial={reduced ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={stagger}
      >
        <BigStat value="8" label="Job data sources — JSearch, Remotive, Arbeitnow, The Muse, Hunter, plus Greenhouse, Lever, and Ashby ATS APIs" />
        <BigStat value="90%+" label="Email deliverability thanks to sending from your own Gmail with MX pre-validation" />
        <BigStat value="3x" label="Reply rate compared to generic mass-send tools, based on internal A/B tests" />
      </motion.div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Pricing teaser
// ──────────────────────────────────────────────────────────────────────────

function PricingTeaser() {
  return (
    <section className="py-20 md:py-28 border-t border-border/60">
      <Reveal className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Start free. Upgrade when it's working.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          3 campaigns and 20 emails per month are on us. When the replies start rolling in, unlock
          unlimited sends for $19/month.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-border hover:bg-accent transition-colors"
          >
            Compare plans
          </Link>
          <Link
            href="/signup"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            Create free account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">AutoApply</span>
          <span>· © {new Date().getFullYear()}</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="hover:text-foreground transition-colors">
            Sign in
          </Link>
          <a
            href="https://github.com/clawb00t13-web/autoapply"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Small motion-aware building blocks
// ──────────────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  trend,
  accent,
}: {
  label: string
  value: string
  trend: string
  accent?: boolean
}) {
  const reduced = useMotionSafe()
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -2, transition: { duration: 0.2 } }}
      className={`rounded-lg border border-border/60 p-4 ${accent ? 'bg-primary/5' : 'bg-background'}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? 'text-primary' : ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{trend}</div>
    </motion.div>
  )
}

function HoverLiftCard({ className, children }: { className: string; children: React.ReactNode }) {
  const reduced = useMotionSafe()
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -4, transition: { duration: 0.25 } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  const reduced = useMotionSafe()
  return (
    <HoverLiftCard className="group rounded-xl border border-border/60 bg-card p-6 hover:border-border transition-colors">
      <motion.div
        whileHover={reduced ? undefined : { scale: 1.05, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary/15 transition-colors"
      >
        {icon}
      </motion.div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </HoverLiftCard>
  )
}

function StepCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <HoverLiftCard className="rounded-xl border border-border/60 bg-card p-6">
      <div className="text-4xl font-mono font-light text-primary/40">{num}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </HoverLiftCard>
  )
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24, scale: 0.9 },
        visible: { opacity: 1, y: 0, scale: 1 },
      }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-4xl md:text-5xl font-semibold text-primary">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </motion.div>
  )
}
