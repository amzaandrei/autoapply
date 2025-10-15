import { ShieldCheck, ShieldAlert, ShieldX, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmailVerificationBadgeProps {
  status: string | null | undefined
  score?: number | null
  className?: string
  showLabel?: boolean
}

type Tone = {
  label: string
  title: string
  icon: typeof ShieldCheck
  classes: string
}

function toneFor(status: string | null | undefined, score: number | null | undefined): Tone {
  switch (status) {
    case 'valid':
    case 'webmail':
      return {
        label: 'Verified',
        title: `Deliverable${score ? ` (score ${score})` : ''}`,
        icon: ShieldCheck,
        classes: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30',
      }
    case 'accept_all':
      return (score ?? 0) >= 50
        ? {
            label: 'Verified',
            title: `Catch-all domain (score ${score ?? 0})`,
            icon: ShieldCheck,
            classes: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30',
          }
        : {
            label: 'Risky',
            title: 'Catch-all — mailbox not confirmed',
            icon: ShieldAlert,
            classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
          }
    case 'unknown':
      return {
        label: 'Unverified',
        title: `No SMTP proof${score ? ` (score ${score})` : ''}`,
        icon: ShieldAlert,
        classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
      }
    case 'invalid':
    case 'disposable':
      return {
        label: status === 'disposable' ? 'Disposable' : 'Undeliverable',
        title: status === 'disposable' ? 'Throwaway domain' : 'Confirmed undeliverable',
        icon: ShieldX,
        classes: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
      }
    case 'error':
      return {
        label: 'Unchecked',
        title: 'Verification service error',
        icon: Shield,
        classes: 'bg-muted text-muted-foreground border-border',
      }
    default:
      return {
        label: 'Unchecked',
        title: 'Not yet verified',
        icon: Shield,
        classes: 'bg-muted text-muted-foreground border-border',
      }
  }
}

export function EmailVerificationBadge({ status, score, className, showLabel = true }: EmailVerificationBadgeProps) {
  const tone = toneFor(status, score)
  const Icon = tone.icon
  return (
    <span
      title={tone.title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        tone.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && tone.label}
    </span>
  )
}
