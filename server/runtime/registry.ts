import type { Agent as AgentView, AgentId, Capability, RegisterAgentInput } from "../../shared/schemas"
import type { AgentRecord, CoordinationStore } from "../adapters/store/types"
import { nowIso } from "../lib/async"
import { AppError, notFound } from "../lib/errors"
import { AGENT_TOOL_ALLOWLIST } from "../tools/registry"
import type { Agent } from "./types"

type RuntimeState = {
  status: "idle" | "busy" | "offline"
  owner: string
  ownerVerified: boolean
  endpoint: string
  ensName: string | null
  entityKey: string | null
  registeredAt: string
  completed: number
  failed: number
  activity: { at: string; text: string }[]
}

const LEGACY_ENS_LABELS: Record<AgentId, string> = {
  supervisor: "supervisor.voxmesh.eth",
  research: "research.voxmesh.eth",
  security: "security.voxmesh.eth",
  metamask: "metamask.voxmesh.eth",
  liquidity: "liquidity.voxmesh.eth",
}

/**
 * Agent registry. Persistent agent metadata lives in the coordination store (Arkiv);
 * runtime status (busy/idle, recent activity) is in-process only.
 */
export class AgentRegistry {
  private readonly agents = new Map<AgentId, Agent>()
  private readonly state = new Map<AgentId, RuntimeState>()

  constructor(
    private readonly store: CoordinationStore,
    agents: Agent[],
    baseUrl: string,
  ) {
    for (const a of agents) {
      this.agents.set(a.id, a)
      this.state.set(a.id, {
        status: "idle",
        owner: "voxmesh-runtime",
        ownerVerified: false,
        endpoint: `${baseUrl}/api/agents/${a.id}`,
        ensName: null,
        entityKey: null,
        registeredAt: nowIso(),
        completed: 0,
        failed: 0,
        activity: [],
      })
    }
  }

  private record(id: AgentId): AgentRecord {
    const a = this.agents.get(id)!
    const s = this.state.get(id)!
    return {
      agentId: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
      endpoint: s.endpoint,
      ensName: s.ensName,
      owner: s.owner,
      status: "idle",
      registeredAt: s.registeredAt,
    }
  }

  /** Registers all built-in agents in the coordination store (idempotent) and syncs entity keys. */
  async bootstrap(): Promise<void> {
    const existing = await this.store.listAgents()
    for (const e of existing) {
      const s = this.state.get(e.data.agentId as AgentId)
      if (!s) continue
      s.owner = e.data.owner
      s.ownerVerified = e.data.owner !== "voxmesh-runtime"
      s.registeredAt = e.data.registeredAt
      const previousPlaceholder = LEGACY_ENS_LABELS[e.data.agentId as AgentId]
      s.ensName = e.data.ensName === previousPlaceholder ? null : e.data.ensName
      s.endpoint = e.data.endpoint || s.endpoint
    }
    const stored = await this.store.upsertAgents([...this.agents.keys()].map((id) => this.record(id)))
    this.syncKeys(stored)
  }

  private syncKeys(stored: { key: string; data: AgentRecord }[]) {
    for (const e of stored) {
      const s = this.state.get(e.data.agentId as AgentId)
      if (s) s.entityKey = e.key
    }
  }

  /** Privileged: (re)register an agent under a verified human owner. */
  async register(input: RegisterAgentInput, ownerSubject: string): Promise<AgentView> {
    const s = this.state.get(input.id)
    if (!s) throw notFound(`Agent ${input.id}`)
    if (s.ownerVerified && s.owner !== ownerSubject) {
      throw new AppError("FORBIDDEN", "Agent is owned by a different verified human", 403)
    }
    s.owner = ownerSubject
    s.ownerVerified = true
    if (input.endpoint) s.endpoint = input.endpoint
    if (input.ensName) s.ensName = input.ensName
    s.registeredAt = nowIso()
    const stored = await this.store.upsertAgents([this.record(input.id)])
    this.syncKeys(stored)
    this.activity(input.id, `Registered to verified owner ${ownerSubject.slice(0, 10)}…`)
    return this.view(input.id)
  }

  /** Discovery reads agent registrations from the coordination store, then binds to local runtimes. */
  async discover(capability: Capability): Promise<{ agent: Agent; entityKey: string }[]> {
    const stored = await this.store.listAgents()
    return stored
      .filter((e) => e.data.capabilities.includes(capability) && e.data.status !== "offline")
      .map((e) => ({ agent: this.agents.get(e.data.agentId as AgentId), entityKey: e.key }))
      .filter((x): x is { agent: Agent; entityKey: string } => Boolean(x.agent) && x.agent!.id !== "supervisor")
  }

  async availableCapabilities(): Promise<Set<Capability>> {
    const stored = await this.store.listAgents()
    return new Set(stored.filter((e) => e.data.agentId !== "supervisor").flatMap((e) => e.data.capabilities as Capability[]))
  }

  get(id: AgentId): Agent {
    const a = this.agents.get(id)
    if (!a) throw notFound(`Agent ${id}`)
    return a
  }

  setStatus(id: AgentId, status: RuntimeState["status"]) {
    const s = this.state.get(id)
    if (s) s.status = status
  }

  activity(id: AgentId, text: string, outcome?: "completed" | "failed") {
    const s = this.state.get(id)
    if (!s) return
    s.activity.unshift({ at: nowIso(), text })
    s.activity.length = Math.min(s.activity.length, 20)
    if (outcome === "completed") s.completed++
    if (outcome === "failed") s.failed++
  }

  view(id: AgentId): AgentView & { entityKey: string | null; stats: { completed: number; failed: number }; activity: { at: string; text: string }[] } {
    const a = this.get(id)
    const s = this.state.get(id)!
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
      owner: s.owner,
      endpoint: s.endpoint,
      identity: { ensName: s.ensName, did: `did:voxmesh:${a.id}`, humanVerified: s.ownerVerified },
      status: s.status,
      createdAt: s.registeredAt,
      allowedTools: [...(AGENT_TOOL_ALLOWLIST[a.id] ?? [])],
      entityKey: s.entityKey,
      stats: { completed: s.completed, failed: s.failed },
      activity: s.activity,
    }
  }

  list() {
    return [...this.agents.keys()].map((id) => this.view(id))
  }
}
