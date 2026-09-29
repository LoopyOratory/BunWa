// BunWa Dream layer — ambient background, celebratory motion, and the small
// shared pieces that give the console its playfulness. Everything here is
// decoration-first: no console logic lives in this file.
//
// Reduced motion: every animated piece degrades to a static state under
// `prefers-reduced-motion`, either through `useReducedMotion()` (Framer
// Motion) or the CSS gates in index.css.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/* ── Aurora: the drifting pastel backdrop ─────────────────────────────
   Four blurred blobs (pink, lilac, apricot, sky) that drift on slow CSS
   loops. Sits behind everything, never intercepts pointers. */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("aurora-root", className)}>
      <div className="aurora-blob aurora-1" />
      <div className="aurora-blob aurora-2" />
      <div className="aurora-blob aurora-3" />
      <div className="aurora-veil" />
    </div>
  )
}

/* ── CountUp: numbers that roll up to their value ─────────────────────
   Animates from the previous value to the next one with an ease-out
   curve. Tabular digits (`.metric`) keep the width stable while moving. */
export function CountUp({
  value,
  duration = 850,
  className,
  format,
}: {
  value: number
  duration?: number
  className?: string
  format?: (n: number) => string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    if (reduce) {
      setDisplay(value)
      return
    }
    const from = fromRef.current
    if (from === value) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      fromRef.current = value
    }
  }, [value, duration, reduce])

  const fmt = format ?? ((n: number) => n.toLocaleString())
  return (
    <span className={cn("metric", className)}>{fmt(display)}</span>
  )
}

/* ── Stagger / StaggerItem: entrance choreography for lists and grids ── */
export function Stagger({
  children,
  className,
  delay = 0.055,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: delay, delayChildren: 0.04 } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 260, damping: 26 },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

/* ── celebrate(): a burst of confetti dots from a point on screen ─────
   Framework-free on purpose: call it from any success handler. No-op
   under reduced motion. */
const CONFETTI_COLORS = [
  "var(--primary)",
  "var(--aur-2)",
  "var(--aur-3)",
  "var(--aur-4)",
  "oklch(0.78 0.12 165)",
  "oklch(0.85 0.12 90)",
]

export function celebrate(x?: number, y?: number) {
  if (typeof window === "undefined" || typeof document === "undefined") return
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

  const cx = x ?? window.innerWidth / 2
  const cy = y ?? window.innerHeight / 2.6
  const count = 14

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span")
    el.className = "celebrate-dot"
    const size = 5 + Math.random() * 6
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.left = `${cx}px`
    el.style.top = `${cy}px`
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    document.body.appendChild(el)

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6
    const dist = 60 + Math.random() * 100
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const anim = el.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.5)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 220 - 110}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 650 + Math.random() * 400,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    )
    anim.onfinish = () => el.remove()
  }
}

/* ── FloatingArt: the tiny living illustration for empty states ─────── */
export function FloatingArt({
  icon,
  className,
}: {
  icon: ReactNode
  className?: string
}) {
  return (
    <span className={cn("blob-art", className)} aria-hidden>
      <span className="blob-art-glow" />
      <span className="blob-art-icon">{icon}</span>
      <span className="blob-art-spark spark-1" />
      <span className="blob-art-spark spark-2" />
      <span className="blob-art-spark spark-3" />
    </span>
  )
}
