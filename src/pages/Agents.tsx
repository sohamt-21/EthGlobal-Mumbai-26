import { useState } from "react"
import { motion } from "motion/react"
import { Bot, FileCode2, Fingerprint, Loader2, ShieldCheck, TrendingUp, Wallet, Wrench, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { AGENT_COLOR } from "@/components/Shell"
import { Dot, KeyChip, Panel, timeAgo } from "@/components/common"
import { EnsAgentNamespace } from "@/components/EnsAgentNamespace"
import { api, ApiError, type AgentView } from "@/lib/api"
import { useRuntime } from "@/lib/runtime"

const ICON = { supervisor: Bot, research: FileCode2, security: ShieldCheck, metamask: Wallet, liquidity: TrendingUp } as const

export function AgentsPage() {
  const { agents, identity, refresh } = useRuntime()
  const [selected, setSelected] = useState<string | null>(null)
  const [ensNames, setEnsNames] = useState<Record<string, string>>({})
  const agent = agents.find((a) => a.id === selected) ?? null

  function updateEnsNames(names: Record<string, string>) {
    setEnsNames(names)
    if (!identity) return
    void Promise.all(
      Object.entries(names).map(([id, ensName]) => api.registerAgent({ id, ensName }).catch(() => undefined)),
    ).then(() => refresh())
  }

  return (
    <div className="grid gap-5">
      <EnsAgentNamespace agents={agents} onNames={updateEnsNames} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {agents.map((a, i) => {
          const Icon = ICON[a.id]
          return (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelected(a.id)}
              className={cn("vx-panel group p-4 text-left transition-colors hover:border-white/[0.14]", selected === a.id && "border-white/[0.16]")}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 place-items-center rounded-xl" style={{ background: `color-mix(in oklch, ${AGENT_COLOR[a.id]} 15%, transparent)`, color: AGENT_COLOR[a.id] }}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{a.name}</span>
                    <Dot tone={a.status === "busy" ? "violet" : a.status === "idle" ? "green" : "red"} pulse={a.status === "busy"} />
                    <span className="vx-mono text-[10px] text-muted-foreground">{a.status}</span>
                  </div>
                  <div className="vx-mono mt-0.5 truncate text-[11px] text-muted-foreground">{ensNames[a.id] ?? a.identity.ensName ?? a.id}</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-foreground/70">{a.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {a.capabilities.map((c) => (
                  <span key={c} className="vx-mono rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px]">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {a.identity.humanVerified ? <ShieldCheck className="size-3.5 text-emerald-400" /> : <Fingerprint className="size-3.5" />}
                  {a.identity.humanVerified ? "Human-owned" : "Runtime-owned"}
                </span>
                <span>
                  {a.stats.completed} done · {a.stats.failed} failed
                </span>
              </div>
            </motion.button>
          )
        })}
      </div>

      {agent && <AgentDetail agent={agent} ensName={ensNames[agent.id] ?? agent.identity.ensName} canRegister={Boolean(identity)} onClose={() => setSelected(null)} onChanged={() => void refresh()} />}
    </div>
  )
}

function AgentDetail({ agent, ensName, canRegister, onClose, onChanged }: { agent: AgentView; ensName: string | null; canRegister: boolean; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function register() {
    setBusy(true)
    setMsg(null)
    try {
      await api.registerAgent({ id: agent.id })
      setMsg("Runtime ownership is bound to your verified identity and written to the coordination store.")
      onChanged()
    } catch (e) {
      setMsg(e instanceof ApiError ? `${e.code}: ${e.message}` : "Registration failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title={`${agent.name} — details`}
      icon={<Bot />}
      actions={
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <dl className="grid content-start gap-2.5 text-[12px]">
          <Row k="Agent ID">
            <KeyChip value={agent.id} />
          </Row>
          <Row k="DID">{agent.identity.did}</Row>
          <Row k="ENS name">
            {ensName ?? "Not loaded"} <span className="text-[10px] text-muted-foreground">(ENSv2)</span>
          </Row>
          <Row k="Owner">{agent.owner === "voxmesh-runtime" ? "voxmesh-runtime" : <KeyChip value={agent.owner} />}</Row>
          <Row k="Endpoint">
            <span className="vx-mono truncate text-[11px]">{agent.endpoint}</span>
          </Row>
          <Row k="Registry entity">
            <KeyChip value={agent.entityKey} />
          </Row>
          <Row k="Registered">{timeAgo(agent.createdAt)}</Row>
        </dl>
        <div className="grid content-start gap-3">
          <div>
            <div className="vx-mono mb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Allowlisted tools</div>
            <div className="flex flex-wrap gap-1">
              {agent.allowedTools.map((t) => (
                <span key={t} className="vx-mono inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10.5px]">
                  <Wrench className="size-3 text-muted-foreground" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="vx-mono mb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Recent activity</div>
            <div className="grid gap-1 text-[12px]">
              {agent.activity.length === 0 && <span className="text-muted-foreground">No activity yet</span>}
              {agent.activity.slice(0, 6).map((a, i) => (
                <div key={i} className="flex gap-2">
                  <span className="vx-mono shrink-0 text-[10px] text-muted-foreground">{timeAgo(a.at)}</span>
                  <span className="text-foreground/80">{a.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid content-start gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="text-[12.5px] font-medium">Claim ownership / update registration</div>
          <p className="text-[11.5px] text-muted-foreground">Privileged operation — requires a verified human session (World ID). ENSv2 names are created separately in the wallet panel above.</p>
          <Button size="sm" onClick={() => void register()} disabled={busy} variant={canRegister ? "default" : "outline"}>
            {busy && <Loader2 className="animate-spin" />} {canRegister ? "Register agent" : "Try (will be denied without World ID)"}
          </Button>
          {msg && <div className="text-[11.5px] text-foreground/80">{msg}</div>}
        </div>
      </div>
    </Panel>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="flex min-w-0 items-center gap-1">{children}</dd>
    </div>
  )
}
