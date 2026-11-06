import { useState, type ReactNode } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { cn } from "cn"
import type { IntegrationMode, Severity } from "../../shared/schemas"

export function Panel({ title, icon, actions, children, className, bodyClassName }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("vx-panel flex min-w-0 flex-col", className)}>
      {title && (
        <header className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          {icon && <span className="text-[color:var(--vx-violet)] [&_svg]:size-4">{icon}</span>}
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground/90">{title}</h2>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, accent = "violet", icon }: { label: string; value: ReactNode; hint?: ReactNode; accent?: "violet" | "blue" | "cyan" | "green" | "red" | "amber"; icon?: ReactNode }) {
  return (
    <div className="vx-panel relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, var(--vx-${accent}), transparent)` }} />
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        <span className="[&_svg]:size-4" style={{ color: `var(--vx-${accent})` }}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

const MODE_STYLE: Record<IntegrationMode, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" },
  mock: { label: "DEV MOCK", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  memory: { label: "LOCAL STORE", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  "dev-bypass": { label: "DEV BYPASS", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  disabled: { label: "OFF", cls: "border-white/10 bg-white/[0.03] text-muted-foreground" },
}

export function ModeBadge({ mode, className }: { mode: IntegrationMode; className?: string }) {
  const s = MODE_STYLE[mode]
  return <span className={cn("vx-mono inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium tracking-wider", s.cls, className)}>{s.label}</span>
}

export function Dot({ tone = "muted", pulse }: { tone?: "green" | "amber" | "red" | "violet" | "cyan" | "muted"; pulse?: boolean }) {
  const color = tone === "muted" ? "oklch(0.55 0.01 270)" : `var(--vx-${tone})`
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", pulse && "vx-pulse")} style={{ background: color, boxShadow: `0 0 0 3px color-mix(in oklch, ${color} 18%, transparent)` }} />
}

const SEV: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-400/25",
  high: "bg-orange-500/15 text-orange-300 border-orange-400/25",
  medium: "bg-amber-500/12 text-amber-200 border-amber-400/20",
  low: "bg-sky-500/12 text-sky-200 border-sky-400/20",
  info: "bg-white/[0.04] text-muted-foreground border-white/10",
}
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn("vx-mono inline-flex rounded border px-1.5 py-px text-[9.5px] uppercase tracking-wider", SEV[severity])}>{severity}</span>
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" || status === "success" || status === "ok"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
      : status === "failed" || status === "error"
        ? "border-red-400/25 bg-red-400/10 text-red-300"
        : status === "partial" || status === "cancelled"
          ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
          : status === "open"
            ? "border-sky-400/25 bg-sky-400/10 text-sky-300"
            : "border-violet-400/25 bg-violet-400/10 text-violet-200"
  return <span className={cn("vx-mono inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", tone)}>{status}</span>
}

export function short(value: string, head = 8, tail = 6) {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function KeyChip({ value, label, href, className }: { value: string | null | undefined; label?: string; href?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="vx-mono text-[11px] text-muted-foreground/60">—</span>
  return (
    <span className={cn("vx-mono group inline-flex max-w-full items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] text-foreground/80", className)} title={value}>
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className="truncate">{short(value)}</span>
      <button
        type="button"
        aria-label="Copy"
        className="text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100"
        onClick={() => {
          void navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open in explorer">
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground/60 [&_svg]:size-7">{icon}</div>}
      <div className="text-sm font-medium text-foreground/80">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted-foreground">{children}</div>}
    </div>
  )
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—"
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** Tiny markdown renderer for the agent reports (headings, lists, bold, code, blockquotes). */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split("\n")
  let list: string[] = []
  const inline = (s: string, k: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((p, i) =>
      p.startsWith("**") ? <strong key={`${k}${i}`}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={`${k}${i}`}>{p.slice(1, -1)}</code> : p,
    )
  }
  const flush = (k: number) => {
    if (list.length) blocks.push(<ul key={`ul${k}`}>{list.map((l, i) => <li key={i}>{inline(l, `l${k}${i}`)}</li>)}</ul>)
    list = []
  }
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^\s*[-*]\s+/.test(line)) return void list.push(line.replace(/^\s*[-*]\s+/, ""))
    flush(i)
    if (!line.trim()) return
    if (line.startsWith("### ")) blocks.push(<h3 key={i}>{inline(line.slice(4), `h${i}`)}</h3>)
    else if (line.startsWith("## ") || line.startsWith("# ")) blocks.push(<h2 key={i}>{inline(line.replace(/^#+\s/, ""), `h${i}`)}</h2>)
    else if (line.startsWith("> ")) blocks.push(<blockquote key={i}>{inline(line.slice(2), `q${i}`)}</blockquote>)
    else blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>)
  })
  flush(lines.length)
  return <div className="vx-md text-[13px]">{blocks}</div>
}
