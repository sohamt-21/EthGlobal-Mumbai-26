import { useEffect, useState } from "react"
import { ArrowRight, Bot, Brain, CheckCircle2, Cpu, Database, Fingerprint, ListChecks, Plug, XCircle } from "lucide-react"
import type { InferenceMetadata } from "../../shared/schemas"
import { Button } from "@/components/ui/button"
import { Dot, Empty, KeyChip, ModeBadge, Panel, Stat, StatusBadge, timeAgo } from "@/components/common"
import { api } from "@/lib/api"
import { useRuntime } from "@/lib/runtime"

export function DashboardPage({ onRun, onOpenTrace }: { onRun: () => void; onOpenTrace: (id: string) => void }) {
  const { stats, integrations, workflows, identity, identityConfig } = useRuntime()
  const [inference, setInference] = useState<InferenceMetadata[]>([])

  useEffect(() => {
    api.inference().then(setInference).catch(() => undefined)
  }, [stats?.inferenceCalls])

  const zg = integrations.find((i) => i.name === "0G Inference")
  const arkiv = integrations.find((i) => i.name === "Arkiv")
  const world = integrations.find((i) => i.name === "World ID")

  return (
    <div className="grid gap-5">
      <div className="vx-panel relative overflow-hidden px-6 py-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[var(--vx-violet)] opacity-[0.12] blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="vx-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Decentralised multi-agent runtime</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-[28px]">
              Every agent has an identity. <span className="vx-gradient-text">Every task has a trace.</span>
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              The Supervisor plans with 0G inference, delegates through Arkiv task entities, and specialists claim, execute and persist auditable results. Privileged operations are gated by World ID.
            </p>
          </div>
          <Button onClick={onRun} className="bg-gradient-to-r from-[var(--vx-violet)] to-[var(--vx-blue)] text-white hover:opacity-90">
            Start a workflow <ArrowRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Agents" value={stats?.agents ?? "—"} icon={<Bot />} hint="registered in coordination store" />
        <Stat label="Active tasks" value={stats?.activeTasks ?? "—"} icon={<ListChecks />} accent="blue" hint="unexpired stored tasks; may include stale claims" />
        <Stat label="Completed" value={stats?.completedTasks ?? "—"} icon={<CheckCircle2 />} accent="green" hint="retained Arkiv tasks (up to 100)" />
        <Stat label="Failed" value={stats?.failedTasks ?? "—"} icon={<XCircle />} accent="red" hint="retained Arkiv tasks (up to 100)" />
        <Stat label="Inference calls" value={stats?.inferenceCalls ?? "—"} icon={<Brain />} accent="violet" hint={stats?.lastInferenceAt ? `last recorded ${timeAgo(stats.lastInferenceAt)}` : stats?.inferenceCalls ? "from retained workflow records" : "none yet"} />
        <Stat label="Identity" value={identity ? "Verified" : "Guest"} icon={<Fingerprint />} accent={identity ? "green" : "amber"} hint={identityConfig ? `World ID: ${identityConfig.mode}` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <IntegrationCard icon={<Cpu />} title="0G Inference" s={zg} rows={zg ? [["Model", zg.meta.model], ["Endpoint", zg.meta.baseUrl], ["Trust mode", zg.meta.trustMode], ["TEE verify", zg.meta.verifyTee]] : []} />
        <IntegrationCard
          icon={<Database />}
          title="Arkiv coordination"
          s={arkiv}
          rows={arkiv ? [["Chain", arkiv.meta.chain], ["Block", arkiv.meta.currentBlock], ["Signer", arkiv.meta.owner], ["Workspace", arkiv.meta.workspace], ["Writes", arkiv.meta.writes ?? arkiv.meta.entities]] : []}
        />
        <IntegrationCard icon={<Fingerprint />} title="World ID" s={world} rows={world ? [["App", world.meta.appId], ["Action", world.meta.action], ["Environment", world.meta.environment], ["Sessions", world.meta.activeSessions]] : []} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="LLM inference activity" icon={<Brain />} bodyClassName="p-0">
          {inference.length === 0 ? (
            <Empty title={stats?.inferenceCalls ? "No request details in this session" : "No inference yet"}>
              {stats?.inferenceCalls ? "The total above includes retained Arkiv workflows; per-request inference details are held in the API process." : "Run a workflow to see 0G request IDs, providers and costs."}
            </Empty>
          ) : (
            <div className="vx-scroll max-h-[340px] overflow-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="vx-mono sticky top-0 bg-[oklch(0.19_0.009_270)] text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-normal">Agent</th>
                    <th className="px-2 py-2 font-normal">Purpose</th>
                    <th className="px-2 py-2 font-normal">Request ID</th>
                    <th className="px-2 py-2 font-normal">Latency</th>
                    <th className="px-4 py-2 font-normal">TEE</th>
                  </tr>
                </thead>
                <tbody>
                  {inference.map((i) => (
                    <tr key={i.requestId} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2">{i.agentId}</td>
                      <td className="px-2 py-2 text-muted-foreground">{i.purpose}</td>
                      <td className="px-2 py-2">
                        <KeyChip value={i.requestId} label={i.provider === "0g" ? "0G" : "mock"} />
                      </td>
                      <td className="vx-mono px-2 py-2 text-muted-foreground">{i.latencyMs}ms</td>
                      <td className="px-4 py-2 text-muted-foreground">{i.teeVerified == null ? "—" : i.teeVerified ? "verified" : "unverified"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Recent workflows" icon={<ListChecks />} bodyClassName="p-2">
          {workflows.length === 0 ? (
            <Empty title="No workflows yet" />
          ) : (
            <div className="grid gap-1">
              {workflows.slice(0, 8).map((w) => (
                <button key={w.id} onClick={() => onOpenTrace(w.id)} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.03]">
                  <StatusBadge status={w.status} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{w.command}</span>
                  <span className="vx-mono shrink-0 text-[10px] text-muted-foreground">{timeAgo(w.startedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function IntegrationCard({ icon, title, s, rows }: { icon: React.ReactNode; title: string; s: import("../../shared/schemas").IntegrationStatus | undefined; rows: [string, unknown][] }) {
  return (
    <Panel title={title} icon={icon} actions={s ? <ModeBadge mode={s.mode} /> : <Plug className="size-3.5 text-muted-foreground" />}>
      {!s ? (
        <div className="text-[12px] text-muted-foreground">Checking…</div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground/80">
            <span className="mt-1.5">
              <Dot tone={s.mode === "live" ? (s.connected ? "green" : "red") : s.mode === "disabled" ? "muted" : "amber"} />
            </span>
            {s.detail}
          </div>
          <dl className="grid gap-1.5 text-[11.5px]">
            {rows
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="vx-mono min-w-0 truncate text-right text-[11px] text-foreground/85">{typeof v === "string" && v.startsWith("0x") && v.length > 20 ? <KeyChip value={v} /> : String(v)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </Panel>
  )
}
