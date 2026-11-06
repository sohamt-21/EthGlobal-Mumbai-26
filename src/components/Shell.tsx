import type { ReactNode } from "react"
import { Activity, Bot, Database, Fingerprint, GitBranch, LayoutDashboard, Menu, Mic, RefreshCw, ShieldCheck, Workflow } from "lucide-react"
import { useState } from "react"
import { cn } from "cn"
import { useRuntime } from "@/lib/runtime"
import { Dot, ModeBadge, short } from "./common"

export type PageId = "dashboard" | "agents" | "command" | "trace" | "explorer" | "identity"

export const NAV: { id: PageId; label: string; icon: typeof Bot; hint: string }[] = [
  { id: "dashboard", label: "Runtime", icon: LayoutDashboard, hint: "Overview" },
  { id: "command", label: "Command", icon: Mic, hint: "Voice & text" },
  { id: "trace", label: "Execution Trace", icon: GitBranch, hint: "Timeline" },
  { id: "agents", label: "Agent Registry", icon: Bot, hint: "Identities" },
  { id: "explorer", label: "Arkiv Explorer", icon: Database, hint: "Shared memory" },
  { id: "identity", label: "Identity & Trust", icon: Fingerprint, hint: "World ID" },
]

export const AGENT_COLOR: Record<string, string> = {
  supervisor: "var(--vx-violet)",
  research: "var(--vx-blue)",
  security: "var(--vx-cyan)",
  metamask: "var(--vx-green)",
  liquidity: "var(--vx-amber)",
}

export function Shell({ page, onNavigate, children }: { page: PageId; onNavigate: (p: PageId) => void; children: ReactNode }) {
  const { online, integrations, identity, streamConnected, stats, refreshIntegrations } = useRuntime()
  const [open, setOpen] = useState(false)
  const current = NAV.find((n) => n.id === page)!
  const active = stats?.activeTasks ?? 0

  const sidebar = (
    <aside className="flex h-full w-[236px] flex-col border-r border-white/[0.06] bg-[oklch(0.17_0.007_270/80%)] px-3 py-4 backdrop-blur">
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--vx-violet)] via-[var(--vx-blue)] to-[var(--vx-cyan)] text-white shadow-[0_8px_24px_-8px_var(--vx-violet)]">
          <Workflow className="size-4" />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight">VoxMesh</div>
          <div className="vx-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Agent runtime</div>
        </div>
      </div>

      <nav className="mt-7 grid gap-0.5">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              onNavigate(n.id)
              setOpen(false)
            }}
            className={cn(
              "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground",
              page === n.id && "bg-white/[0.06] text-foreground",
            )}
          >
            {page === n.id && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--vx-violet)]" />}
            <n.icon className={cn("size-4", page === n.id && "text-[var(--vx-violet)]")} />
            {n.label}
            {n.id === "trace" && active > 0 && <span className="vx-mono ml-auto rounded bg-violet-500/20 px-1.5 text-[10px] text-violet-200">{active}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-auto grid gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="vx-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Integrations</span>
            <button onClick={() => void refreshIntegrations()} className="text-muted-foreground hover:text-foreground" aria-label="Refresh integrations">
              <RefreshCw className="size-3" />
            </button>
          </div>
          <div className="grid gap-1.5">
            {integrations.slice(0, 4).map((i) => (
              <div key={i.name} className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="flex items-center gap-1.5 text-foreground/80">
                  <Dot tone={i.mode === "live" ? (i.connected ? "green" : "red") : i.mode === "disabled" ? "muted" : "amber"} />
                  {i.name.replace(" Inference", "")}
                </span>
                <ModeBadge mode={i.mode} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className={cn("grid size-7 place-items-center rounded-lg", identity ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.05] text-muted-foreground")}>
            {identity ? <ShieldCheck className="size-3.5" /> : <Fingerprint className="size-3.5" />}
          </div>
          <div className="min-w-0 text-[11px]">
            <div className="font-medium text-foreground/90">{identity ? (identity.verificationProvider === "world-id" ? "Verified human" : "Dev bypass session") : "Not verified"}</div>
            <div className="vx-mono truncate text-[10px] text-muted-foreground">{identity ? short(identity.subject, 8, 4) : "World ID required for privileged ops"}</div>
          </div>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="vx dark vx-bg flex min-h-screen text-foreground">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>{sidebar}</div>
          <div className="flex-1 bg-black/50" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[oklch(0.155_0.006_270/75%)] px-4 backdrop-blur md:px-7">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">VoxMesh</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-medium">{current.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="hidden items-center gap-1.5 sm:flex">
              <Activity className="size-3.5" />
              {streamConnected ? "Live stream" : "Stream offline"}
              <Dot tone={streamConnected ? "green" : "red"} pulse={streamConnected} />
            </span>
            <span className="flex items-center gap-1.5">
              API <Dot tone={online === null ? "muted" : online ? "green" : "red"} />
            </span>
          </div>
        </header>
        {online === false && (
          <div className="border-b border-red-400/20 bg-red-500/10 px-7 py-2 text-[12px] text-red-200">
            The VoxMesh API is unreachable. Start it with <code className="vx-mono">npm run dev</code>.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-7">{children}</main>
      </div>
    </div>
  )
}
