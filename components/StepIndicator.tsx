'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StepConfig {
  label: string
  href: string
}

const STEPS: StepConfig[] = [
  { label: 'Upload',   href: '/upload'   },
  { label: 'Discover', href: '/discover' },
  { label: 'Generate', href: '/generate' },
  { label: 'Review',   href: '/review'   },
  { label: 'Send',     href: '/send'     },
]

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4 | 5
  campaignId?: string
}

function buildHref(step: StepConfig, campaignId?: string): string {
  const needsId = ['/generate', '/review', '/send'].includes(step.href)
  if (needsId && campaignId) return `${step.href}?campaignId=${campaignId}`
  return step.href
}

export function StepIndicator({ currentStep, campaignId }: StepIndicatorProps) {
  const router = useRouter()

  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const stepNum = (idx + 1) as 1 | 2 | 3 | 4 | 5
          const isComplete = stepNum < currentStep
          const isCurrent = stepNum === currentStep
          const isClickable = isComplete

          return (
            <li key={step.href} className="flex items-center">
              {/* Step circle + label */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => {
                  if (isClickable) router.push(buildHref(step, campaignId))
                }}
                className={cn(
                  'flex flex-col items-center gap-1 group',
                  isClickable
                    ? 'cursor-pointer'
                    : isCurrent
                      ? 'cursor-default'
                      : 'cursor-not-allowed opacity-40'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    isComplete
                      ? 'border-primary bg-primary text-primary-foreground group-hover:bg-primary/80'
                      : isCurrent
                        ? 'border-primary bg-background text-primary'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground'
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : stepNum}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium whitespace-nowrap',
                    isCurrent
                      ? 'text-primary'
                      : isComplete
                        ? 'text-muted-foreground group-hover:text-foreground transition-colors'
                        : 'text-muted-foreground/50'
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-2 mb-5 h-[2px] w-8 shrink-0 rounded',
                    stepNum < currentStep ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
