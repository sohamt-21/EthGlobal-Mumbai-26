import type { AgentMessage, EntityKind, ExplorerEntity, IntegrationStatus, Task, TaskStatus } from "../../../shared/schemas"
import { nowIso } from "../../lib/async"
import { conflict, notFound } from "../../lib/errors"
import type {
  AgentRecord,
  CoordinationStore,
  ExecutionRecord,
  IdentityRecord,
  Stored,
  TaskFilter,
  TxRef,
  WorkflowRecord,
} from "./types"

type AnyRecord = AgentRecord | Task | ExecutionRecord | AgentMessage | WorkflowRecord | IdentityRecord

/**
 * LOCAL DEVELOPMENT STORE — not Arkiv. Same semantics as the Arkiv adapter (keys, claims,
 * conflicts) so tests exercise the runtime; keys are prefixed `local:` and txHash is always null.
 */
export class MemoryCoordinationStore implements CoordinationStore {
  readonly mode = "memory" as const
  readonly ownerAddress = null
  private seq = 0
  private readonly entities = new Map<string, { kind: EntityKind; data: AnyRecord; createdAt: string }>()

  async init(): Promise<void> {}

  private put(kind: EntityKind, data: AnyRecord): string {
    const key = `local:${kind}:${(++this.seq).toString(16).padStart(6, "0")}`
    this.entities.set(key, { kind, data: structuredClone(data), createdAt: nowIso() })
    return key
  }

  private all<T extends AnyRecord>(kind: EntityKind): Stored<T>[] {
    return [...this.entities.entries()]
      .filter(([, e]) => e.kind === kind)
      .map(([key, e]) => ({ key, owner: null, expiresAtBlock: null, data: structuredClone(e.data) as T }))
      .reverse()
  }

  async status(): Promise<IntegrationStatus> {
    return {
      name: "Arkiv",
      mode: "memory",
      connected: false,
      detail: "LOCAL DEV STORE — ARKIV_PRIVATE_KEY not configured. Entities live in server memory, NOT on Arkiv.",
      meta: { entities: this.entities.size },
      checkedAt: nowIso(),
    }
  }

  async upsertAgents(agents: AgentRecord[]): Promise<Stored<AgentRecord>[]> {
    const existing = this.all<AgentRecord>("agent")
    for (const agent of agents) {
      const found = existing.find((e) => e.data.agentId === agent.agentId)
      if (found) this.entities.set(found.key, { kind: "agent", data: agent, createdAt: nowIso() })
      else this.put("agent", agent)
    }
    return this.listAgents()
  }

  async listAgents() {
    return this.all<AgentRecord>("agent")
  }

  async createTasks(tasks: Task[], messages: AgentMessage[]) {
    const taskKeys: Record<string, string> = {}
    const messageKeys: Record<string, string> = {}
    for (const t of tasks) taskKeys[t.id] = this.put("task", t)
    for (const m of messages) messageKeys[m.id] = this.put("message", m)
    return { txHash: null, taskKeys, messageKeys }
  }

  async queryTasks(filter: TaskFilter) {
    return this.all<Task>("task")
      .filter(
        (t) =>
          (!filter.workflowId || t.data.workflowId === filter.workflowId) &&
          (!filter.status || t.data.status === filter.status) &&
          (!filter.capability || t.data.requiredCapability === filter.capability),
      )
      .slice(0, filter.limit ?? 100)
  }

  async getTask(key: string) {
    const e = this.entities.get(key)
    return e && e.kind === "task" ? { key, owner: null, expiresAtBlock: null, data: structuredClone(e.data) as Task } : null
  }

  private patchTask(key: string, patch: Partial<Task>): Task {
    const e = this.entities.get(key)
    if (!e || e.kind !== "task") throw notFound(`Task entity ${key}`)
    const next = { ...(e.data as Task), ...patch, updatedAt: nowIso() }
    e.data = next
    return structuredClone(next)
  }

  async claimTask(key: string, agentId: string, message: AgentMessage | null) {
    const current = await this.getTask(key)
    if (!current) throw notFound(`Task entity ${key}`)
    if (current.data.status !== "open") throw conflict(`Task ${current.data.id} is ${current.data.status}, not open`)
    const task = this.patchTask(key, { status: "claimed", claimedBy: agentId, assignedAgent: agentId as Task["assignedAgent"] })
    if (message) this.put("message", message)
    return { txHash: null, task }
  }

  async setTaskStatus(key: string, status: TaskStatus): Promise<TxRef> {
    this.patchTask(key, { status })
    return { txHash: null }
  }

  async completeTask(key: string, record: ExecutionRecord, message: AgentMessage | null) {
    const resultKey = this.put("execution", record)
    this.patchTask(key, { status: record.status === "success" ? "completed" : "failed", resultEntityKey: resultKey })
    if (message) this.put("message", message)
    return { txHash: null, resultKey }
  }

  async getExecution(key: string) {
    const e = this.entities.get(key)
    return e && e.kind === "execution"
      ? { key, owner: null, expiresAtBlock: null, data: structuredClone(e.data) as ExecutionRecord }
      : null
  }

  async listExecutions(filter: { workflowId?: string; taskId?: string; limit?: number }) {
    return this.all<ExecutionRecord>("execution")
      .filter((e) => (!filter.workflowId || e.data.workflowId === filter.workflowId) && (!filter.taskId || e.data.taskId === filter.taskId))
      .slice(0, filter.limit ?? 100)
  }

  async listMessages(filter: { workflowId?: string; limit?: number }) {
    return this.all<AgentMessage>("message")
      .filter((m) => !filter.workflowId || m.data.workflowId === filter.workflowId)
      .slice(0, filter.limit ?? 100)
  }

  async saveWorkflow(record: WorkflowRecord) {
    return { txHash: null, key: this.put("workflow", record) }
  }

  async recordIdentity(record: IdentityRecord) {
    return { txHash: null, key: this.put("identity", record) }
  }

  async explore(kind: EntityKind, limit: number): Promise<ExplorerEntity[]> {
    return this.all<AnyRecord>(kind)
      .slice(0, limit)
      .map((e) => ({
        key: e.key,
        kind,
        owner: null,
        expiresAtBlock: null,
        expiresAtApprox: null,
        createdAtBlock: null,
        attributes: flatAttributes(e.data),
        payloadPreview: JSON.stringify(e.data).slice(0, 600),
      }))
  }
}

function flatAttributes(data: AnyRecord): ExplorerEntity["attributes"] {
  const out: ExplorerEntity["attributes"] = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" ? v.slice(0, 120) : v
    }
  }
  return out
}
