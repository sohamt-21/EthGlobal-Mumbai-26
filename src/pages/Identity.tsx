import { useEffect, useState } from "react"
import { Fingerprint, KeyRound, Lock, ScrollText, ShieldCheck, Users } from "lucide-react"
import type { IdentityEvent } from "../../shared/schemas"
import { AGENT_COLOR } from "@/components/Shell"
import { WorldIdVerify } from "@/components/WorldIdVerify"
import { Empty, KeyChip, ModeBadge, Panel, timeAgo } from "@/components/common"
import { api } from "@/lib/api"
import { useRuntime } from "@/lib/runtime"

const PERMISSIONS: { op: string; who: string; gate: string }[] = [
  { op: "Register / claim an agent", who: "Verified human", gate: "World ID session (agent:register)" },
  { op: "Start a workflow", who: "Anyone / verified human", gate: "WORKFLOW_REQUIRES_HUMAN" },
  { op: "Create / claim / complete Arkiv tasks via API", who: "Worker agent or verified human", gate: "x-agent-key or task:write" },
  { op: "Delegate tasks", who: "Supervisor only", gate: "Message bus topology" },
  { op: "Message other agents", who: "Specialists → Supervisor only", gate: "Message bus topology" },
  { op: "Invoke tools", who: "Per-agent allowlist", gate: "ToolRegistry" },
  { op: "Complete a claimed task", who: "The claiming agent", gate: "Ownership check" },
]

export function IdentityPage() {
  const { identity, identityConfig, agents } = useRuntime()
  const [events, setEvents] = useState<IdentityEvent[]>([])

  useEffect(() => {
    const load = () => api.identityEvents().then(setEvents).catch(() => undefined)
    void load()
    const t = window.setInterval(load, 5000)
    return () => window.clearInterval(t)
  }, [identity])

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Your verification" icon={<Fingerprint />} actions={identityConfig && <ModeBadge mode={identityConfig.mode} />}>
          <div className="grid gap-4">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              VoxMesh binds agent ownership and privileged operations to a World ID proof of human. The proof is verified server-side against World's Developer Portal; only a hash of
              the action-scoped nullifier is stored, and the attestation is written to the coordination store.
            </p>
            {identity ? (
              <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
                <Item k="Status">
                  <span className="text-emerald-300">{identity.verificationStatus}</span>
                </Item>
                <Item k="Provider">{identity.verificationProvider === "dev-bypass" ? <span className="text-amber-300">dev-bypass (NOT World ID)</span> : "World ID"}</Item>
                <Item k="Subject">
                  <KeyChip value={identity.subject} />
                </Item>
                <Item k="Credential">{identity.credential ?? "—"}</Item>
                <Item k="Verified">{timeAgo(identity.verifiedAt)}</Item>
                <Item k="Expires">{new Date(identity.expiresAt).toLocaleTimeString()}</Item>
                <Item k="Attestation entity">
                  <KeyChip value={identity.arkivEntityKey} />
                </Item>
                <Item k="Permissions">
                  <div className="flex flex-wrap gap-1">
                    {identity.permissions.map((p) => (
                      <span key={p} className="vx-mono rounded border border-emerald-400/20 bg-emerald-400/10 px-1.5 text-[10px] text-emerald-200">
                        {p}
                      </span>
                    ))}
                  </div>
                </Item>
              </dl>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[12px] text-muted-foreground">
                <Lock className="size-4" /> Not verified — privileged operations (agent registration{identityConfig?.workflowRequiresHuman ? ", workflows" : ""}) are denied.
              </div>
            )}
            <WorldIdVerify />
            {identityConfig && (
              <div className="vx-mono flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
                <span>action={identityConfig.action}</span>
                <span>env={identityConfig.environment}</span>
                {identityConfig.appId && <span>app={identityConfig.appId}</span>}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Identity events" icon={<ScrollText />} bodyClassName="p-0">
          {events.length === 0 ? (
            <Empty title="No identity events yet" />
          ) : (
            <div className="vx-scroll max-h-[360px] divide-y divide-white/[0.04] overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="grid gap-0.5 px-4 py-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className={`vx-mono text-[10.5px] ${e.type.includes("fail") || e.type.includes("denied") ? "text-red-300" : e.type === "verify.success" ? "text-emerald-300" : "text-muted-foreground"}`}>{e.type}</span>
                    <span className="vx-mono ml-auto text-[10px] text-muted-foreground">{timeAgo(e.timestamp)}</span>
                  </div>
                  <div className="text-foreground/80">{e.detail}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Registered agents & ownership" icon={<Users />} bodyClassName="p-0">
          <table className="w-full text-left text-[12px]">
            <thead className="vx-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-normal">Agent</th>
                <th className="px-2 py-2 font-normal">Owner</th>
                <th className="px-4 py-2 font-normal">Human-verified</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-white/[0.04]">
                  <td className="px-4 py-2.5" style={{ color: AGENT_COLOR[a.id] }}>
                    {a.name}
                    <div className="vx-mono text-[10px] text-muted-foreground">{a.identity.ensName}</div>
                  </td>
                  <td className="px-2 py-2.5">{a.owner === "voxmesh-runtime" ? <span className="text-muted-foreground">voxmesh-runtime</span> : <KeyChip value={a.owner} />}</td>
                  <td className="px-4 py-2.5">{a.identity.humanVerified ? <ShieldCheck className="size-4 text-emerald-400" /> : <span className="text-muted-foreground">no</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Delegation permissions" icon={<KeyRound />} bodyClassName="p-0">
          <table className="w-full text-left text-[12px]">
            <thead className="vx-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-normal">Operation</th>
                <th className="px-2 py-2 font-normal">Allowed</th>
                <th className="px-4 py-2 font-normal">Enforced by</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.op} className="border-t border-white/[0.04]">
                  <td className="px-4 py-2">{p.op}</td>
                  <td className="px-2 py-2 text-foreground/75">{p.who}</td>
                  <td className="vx-mono px-4 py-2 text-[10.5px] text-muted-foreground">{p.gate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="vx-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </div>
  )
}
