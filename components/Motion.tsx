'use client'

import { motion, useReducedMotion } from 'motion/react'

// All primitives respect prefers-reduced-motion: if the OS setting is on,
// initial styles are skipped and the component renders in its final state
// without ever animating. No guards needed at call sites.

// Page wrapper — fades in on mount
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// Staggered list item — each child animates in sequence based on its index
export function StaggerItem({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduced ? 0 : index * 0.05, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// Card entrance — scales up slightly from 96%
export function CardEntrance({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: reduced ? 0 : delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// Fade in from below
export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduced ? 0 : delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// Stagger a row of children — each immediate child gets its own FadeUp with
// an incremental delay. Useful for grids/lists where you don't want to wrap
// every item at the call site.
export function Stagger({
  children,
  className,
  baseDelay = 0,
  step = 0.06,
}: {
  children: React.ReactNode
  className?: string
  baseDelay?: number
  step?: number
}) {
  const arr = Array.isArray(children) ? children : [children]
  return (
    <div className={className}>
      {arr.map((child, i) => (
        <FadeUp key={i} delay={baseDelay + i * step}>
          {child}
        </FadeUp>
      ))}
    </div>
  )
}

// Re-export motion for direct use
