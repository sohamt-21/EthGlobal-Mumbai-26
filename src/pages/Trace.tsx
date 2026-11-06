import { useEffect, useState } from "react"
import { ArrowRightLeft, Brain, Database, GitBranch, ListChecks, Loader2, RefreshCw } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { AGENT_COLOR } from "@/components/Shell"
import { TraceTimeline } from "@/components/TraceTimeline"
import { Empty, KeyChip, Panel, StatusBadge, clock, timeAgo } from "@/components/common"
import { api, type Stored } from "@/lib/api"
import { useRuntime } from "@/lib/runtime"

export function TracePage() {
  const { workflows, selectedWorkflowId, selectWorkflow } = useRuntime()
  const wf = workflows.find((w) => w.id === selectedWorkflowId) ?? workflows[0] ?? null
  const [stored, setStored] = useState<{ executions: Stored<Record<string, unknown>>[]; messages: Stored<Record<string, unknown>>[]; tasks: Stored<Record<string, unknown>>[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [storeError, setStoreError] = useState<string | null>(null)

  useEffect(() => {
    setStored(null)
    setStoreError(null)
  }, [wf?.id])

  async function loadStored() {
    if (!wf) return
    setLoading(true)
    setStoreError(null)
    try {
      setStored(await api.workflowArkiv(wf.id))
    } catch (e) {
      setStoreError(e instanceof Error ? e.message : "Failed to query store")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Panel title="Workflows" icon={<ListChecks />} bodyClassName="p-2">
        {workflows.length === 0 ? (
          <Empty title="No executions yet" />
        ) : (
          <div className="vx-scroll grid max-h-[75vh] gap-1 overflow-y-auto">
            {workflows.map((w) => (
              <button key={w.id} onClick={() => selectWorkflow(w.id)} className={cn("grid gap-1 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.03]", w.id === wf?.id && "bg-white/[0.05]")}>
                <div className="flex items-center gap-2">
                  <StatusBadge status={w.status} />
                  <span className="vx-mono ml-auto text-[10px] text-muted-foreground">{timeAgo(w.startedAt)}</span>
                </div>
                <span className="line-clamp-2 text-[12px] text-foreground/85">{w.command}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {!wf ? (
        <Panel>
          <Empty icon={<GitBranch />} title="Select a workflow">Execution timelines, delegation details, 0G request IDs and Arkiv entity IDs appear here.</Empty>
        </Panel>
      ) : (
        <div className="grid min-w-0 gap-5">
          <div className="vx-panel grid gap-3 p-4 md:grid-cols-4">
            <Meta label="Workflow">
              <KeyChip value={wf.id} />
            </Meta>
            <Meta label="Status">
              <StatusBadge status={wf.status} />
            </Meta>
            <Meta label="Intent">{wf.plan?.intent ?? "planning…"}</Meta>
            <Meta label="Duration">{wf.completedAt ? `${((Date.parse(wf.completedAt) - Date.parse(wf.startedAt)) / 1000).toFixed(1)}s` : "running"}</Meta>
            <Meta label="Initiator">
              {wf.initiatedBy.verified ? `${wf.initiatedBy.provider} · ` : "anonymous"}
              {wf.initiatedBy.verified && <KeyChip value={wf.initiatedBy.subject} />}
            </Meta>
            <Meta label="Agent calls">{wf.agentCalls}</Meta>
            <Meta label="Inference calls">{wf.inference.length}</Meta>
            <Meta label="Workflow record">
              <KeyChip value={wf.arkivRecordKey} />
            </Meta>
          </div>

          <Panel title="Delegated tasks" icon={<Database />} bodyClassName="p-0">
            {wf.tasks.length === 0 ? (
              <Empty title="No delegation">{wf.plan?.reasoning}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[12px]">
                  <thead className="vx-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-normal">Task</th>
                      <th className="px-2 py-2 font-normal">Agent</th>
                      <th className="px-2 py-2 font-normal">Status</th>
                      <th className="px-2 py-2 font-normal">Depends on</th>
                      <th className="px-2 py-2 font-normal">Task entity</th>
                      <th className="px-2 py-2 font-normal">Result entity</th>
                      <th className="px-4 py-2 font-normal">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wf.tasks.map((t) => {
                      const r = wf.results[t.id]
                      return (
                        <tr key={t.id} className="border-t border-white/[0.04] align-top">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{t.type}</div>
                            <KeyChip value={t.id} className="mt-1" />
                          </td>
                          <td className="px-2 py-2.5" style={{ color: AGENT_COLOR[t.assignedAgent ?? ""] }}>
                            {t.assignedAgent}
                          </td>
                          <td className="px-2 py-2.5">
                            <StatusBadge status={t.status} />
                            {r?.error && <div className="mt-1 max-w-[200px] text-[11px] text-red-300">{r.error.code}: {r.error.message}</div>}
                          </td>
                          <td className="vx-mono px-2 py-2.5 text-[10.5px] text-muted-foreground">{t.dependsOn.length ? t.dependsOn.map((d) => d.slice(0, 13)).join(", ") : "—"}</td>
                          <td className="px-2 py-2.5">
                            <KeyChip value={t.arkivEntityKey} />
                          </td>
                          <td className="px-2 py-2.5">
                            <KeyChip value={t.resultEntityKey} />
                          </td>
                          <td className="vx-mono px-4 py-2.5 text-muted-foreground">{r?.attempts ?? "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Panel title="Execution timeline" icon={<GitBranch />} bodyClassName="p-0">
              <div className="vx-scroll max-h-[640px] overflow-y-auto px-4 py-3">
                <TraceTimeline trace={wf.trace} />
              </div>
            </Panel>
            <div className="grid content-start gap-5">
              <Panel title="0G inference calls" icon={<Brain />} bodyClassName="p-0">
                {wf.inference.length === 0 ? (
                  <Empty title="No inference yet" />
                ) : (
                  <div className="grid divide-y divide-white/[0.04]">
                    {wf.inference.map((i) => (
                      <div key={i.requestId} className="grid gap-1 px-4 py-2.5 text-[12px]">
                        <div className="flex items-center gap-2">
                          <span style={{ color: AGENT_COLOR[i.agentId] }}>{i.agentId}</span>
                          <span className="text-muted-foreground">{i.purpose}</span>
                          <span className="vx-mono ml-auto text-[10px] text-muted-foreground">{i.latencyMs}ms · {i.model}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <KeyChip value={i.requestId} label={i.provider === "0g" ? "0G req" : "mock"} />
                          {i.providerAddress && <KeyChip value={i.providerAddress} label="provider" />}
                          {i.teeVerified != null && <span className="vx-mono rounded border border-white/10 px-1.5 py-0.5 text-[10px]">tee {i.teeVerified ? "✓" : "✗"}</span>}
                          {i.billing && <span className="vx-mono rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">{i.billing.totalCost} neuron</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Agent messages" icon={<ArrowRightLeft />} bodyClassName="p-0">
                <div className="grid divide-y divide-white/[0.04]">
                  {wf.messages.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 px-4 py-2 text-[12px]">
                      <span className="vx-mono text-[10px] text-muted-foreground">{clock(m.timestamp)}</span>
                      <span style={{ color: AGENT_COLOR[m.senderAgentId] }}>{m.senderAgentId}</span>→<span style={{ color: AGENT_COLOR[m.receiverAgentId] }}>{m.receiverAgentId}</span>
                      <span className="vx-mono ml-auto rounded bg-white/[0.04] px-1.5 text-[10px]">{m.messageType}</span>
                    </div>
                  ))}
                  {wf.messages.length === 0 && <Empty title="No messages" />}
                </div>
              </Panel>
              <Panel
                title="Verify against coordination store"
                icon={<Database />}
                actions={
                  <Button size="sm" variant="outline" onClick={() => void loadStored()} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Query
                  </Button>
                }
              >
                {!stored && !storeError && <div className="text-[12px] text-muted-foreground">Re-read this workflow's tasks, execution records and messages directly from the store (Arkiv queries, not runtime memory).</div>}
                {storeError && <div className="text-[12px] text-red-300">{storeError}</div>}
                {stored && (
                  <div className="grid gap-2 text-[12px]">
                    <div className="grid grid-cols-3 gap-2">
                      <Count label="Tasks" n={stored.tasks.length} />
                      <Count label="Executions" n={stored.executions.length} />
                      <Count label="Messages" n={stored.messages.length} />
                    </div>
                    {stored.tasks.map((t) => (
                      <div key={t.key} className="flex items-center gap-2">
                        <KeyChip value={t.key} />
                        <StatusBadge status={String(t.data.status)} />
                        <span className="vx-mono ml-auto text-[10px] text-muted-foreground">exp. block {t.expiresAtBlock ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="vx-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[12.5px]">{children}</div>
    </div>
  )
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{n}</div>
    </div>
  )
}
