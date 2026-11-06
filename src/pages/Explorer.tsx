import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Database, Loader2, RefreshCw } from "lucide-react"
import { cn } from "cn"
import type { EntityKind, ExplorerEntity } from "../../shared/schemas"
import { Button } from "@/components/ui/button"
import { Empty, KeyChip, ModeBadge, Panel, timeAgo } from "@/components/common"
import { api } from "@/lib/api"
import { useIntegration } from "@/lib/runtime"

const KINDS: { id: EntityKind; label: string }[] = [
  { id: "task", label: "Tasks" },
  { id: "execution", label: "Executions" },
  { id: "agent", label: "Agents" },
  { id: "message", label: "Messages" },
  { id: "workflow", label: "Workflows" },
  { id: "identity", label: "Identities" },
]

export function ExplorerPage() {
  const arkiv = useIntegration("Arkiv")
  const [kind, setKind] = useState<EntityKind>("task")
  const [data, setData] = useState<{ mode: string; owner: string | null; entities: ExplorerEntity[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const load = useCallback(async (k: EntityKind) => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.explore(k, 50))
      setFetchedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(kind)
  }, [kind, load])

  const statusOf = (e: ExplorerEntity) => (typeof e.attributes.status === "string" ? e.attributes.status : null)
  const entities = data?.entities ?? []
  const active = entities.filter((e) => ["open", "claimed", "running"].includes(statusOf(e) ?? ""))
  const completed = entities.filter((e) => ["completed", "success"].includes(statusOf(e) ?? ""))

  return (
    <div className="grid gap-5">
      <div className="vx-panel flex flex-wrap items-center gap-3 p-4">
        <Database className="size-5 text-[var(--vx-green)]" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            Arkiv shared memory {arkiv && <ModeBadge mode={arkiv.mode} />}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {data?.mode === "live"
              ? `Live query against ${String(arkiv?.meta.chain ?? "Arkiv")} · workspace ${String(arkiv?.meta.workspace ?? "")} · owner-scoped`
              : "Local development store — entities are NOT on Arkiv. Configure ARKIV_PRIVATE_KEY for live data."}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data?.owner && <KeyChip value={data.owner} label="owner" />}
          <Button size="sm" variant="outline" onClick={() => void load(kind)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} className={cn("rounded-lg border px-3 py-1.5 text-[12px] transition-colors", kind === k.id ? "border-violet-300/30 bg-violet-500/15 text-foreground" : "border-white/[0.07] text-muted-foreground hover:text-foreground")}>
            {k.label}
          </button>
        ))}
        {kind === "task" && data && (
          <span className="ml-auto flex items-center gap-3 text-[11.5px] text-muted-foreground">
            <span>{active.length} active</span>
            <span>{completed.length} completed</span>
            <span>{entities.length} total</span>
          </span>
        )}
      </div>

      <Panel title={`${KINDS.find((k) => k.id === kind)!.label} entities`} icon={<Database />} actions={fetchedAt && <span className="vx-mono text-[10px] text-muted-foreground">queried {timeAgo(fetchedAt)}</span>} bodyClassName="p-0">
        {error ? (
          <div className="flex items-center gap-2 p-4 text-[12px] text-red-300">
            <AlertTriangle className="size-4" /> {error}
          </div>
        ) : entities.length === 0 ? (
          <Empty icon={<Database />} title={loading ? "Querying…" : "No entities"}>
            Run a workflow to create task, execution and message entities.
          </Empty>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {entities.map((e) => {
              const isOpen = open === e.key
              const attrs = Object.entries(e.attributes).filter(([k]) => k !== "workspace" && k !== "arkiv.schema")
              return (
                <div key={e.key}>
                  <button onClick={() => setOpen(isOpen ? null : e.key)} className="grid w-full grid-cols-[16px_minmax(0,1fr)] gap-2 px-4 py-2.5 text-left hover:bg-white/[0.02]">
                    {isOpen ? <ChevronDown className="mt-0.5 size-4 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />}
                    <div className="grid min-w-0 gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <KeyChip value={e.key} />
                        {statusOf(e) && <span className="vx-mono rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px]">{statusOf(e)}</span>}
                        <span className="vx-mono ml-auto text-[10px] text-muted-foreground">
                          {e.expiresAtBlock ? `expires block ${e.expiresAtBlock}${e.expiresAtApprox ? ` (~${new Date(e.expiresAtApprox).toLocaleString()})` : ""}` : "no expiry (local store)"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {attrs.slice(0, 7).map(([k, v]) => (
                          <span key={k} className="vx-mono max-w-[260px] truncate rounded border border-white/[0.06] px-1.5 py-0.5 text-[10px]">
                            <span className="text-muted-foreground">{k}=</span>
                            {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="grid gap-2 bg-black/20 px-10 py-3">
                      <div className="grid gap-1 text-[11px] md:grid-cols-3">
                        <span className="text-muted-foreground">
                          Owner: <span className="vx-mono text-foreground/80">{e.owner ?? "—"}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Created at block: <span className="vx-mono text-foreground/80">{e.createdAtBlock ?? "—"}</span>
                        </span>
                      </div>
                      <div className="vx-mono text-[10px] uppercase tracking-wider text-muted-foreground">Attributes</div>
                      <pre className="vx-mono vx-scroll max-h-40 overflow-auto rounded-lg bg-black/30 p-2.5 text-[11px]">{JSON.stringify(e.attributes, null, 2)}</pre>
                      {e.payloadPreview && (
                        <>
                          <div className="vx-mono text-[10px] uppercase tracking-wider text-muted-foreground">Payload (bytes, decoded)</div>
                          <pre className="vx-mono vx-scroll max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2.5 text-[11px]">{e.payloadPreview}</pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
