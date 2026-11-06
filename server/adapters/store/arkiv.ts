import { createPublicClient, createWalletClient, ExpirationTime, type CreateEntityParameters, type PatchEntityParameters } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq, type Expression } from "@arkiv-network/sdk/query"
import { bytes, defineSchema, i32, str } from "@arkiv-network/sdk/schema"
import { type Hex, hexToString, http, isHex, stringToBytes } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import type { AgentMessage, EntityKind, ExplorerEntity, IntegrationStatus, Task, TaskStatus } from "../../../shared/schemas"
import { nowIso, SerialQueue } from "../../lib/async"
import { AppError, conflict, errorMessage, notFound, redact } from "../../lib/errors"
import type {
  AgentRecord,
  CoordinationStore,
  ExecutionRecord,
  IdentityRecord,
  Stored,
  TaskFilter,
  WorkflowRecord,
} from "./types"

/**
 * Arkiv entity schemas. Arkiv `str` attributes are capped at 128 bytes, so each entity carries a
 * small set of indexed columns for querying plus the full record as JSON in a `payload` bytes column.
 * Every entity carries `workspace` so this deployment is isolated on the shared testnet, and every
 * query is additionally scoped with `.ownedBy(signer)`.
 */
export const ArkivSchemas = {
  agent: defineSchema("voxmesh.agent.v1", {
    workspace: str().indexed(),
    agentId: str().indexed(),
    status: str().indexed(),
    primaryCapability: str().indexed(),
    ensName: str(),
    payload: bytes(),
  }),
  task: defineSchema("voxmesh.task.v1", {
    workspace: str().indexed(),
    taskId: str().indexed(),
    workflowId: str().indexed(),
    taskType: str().indexed(),
    status: str().indexed(),
    capability: str().indexed(),
    claimedBy: str().indexed(),
    priority: i32().indexed(),
    payload: bytes(),
  }),
  execution: defineSchema("voxmesh.execution.v1", {
    workspace: str().indexed(),
    executionId: str().indexed(),
    workflowId: str().indexed(),
    taskId: str().indexed(),
    agentId: str().indexed(),
    status: str().indexed(),
    inferenceRequestId: str(),
    payload: bytes(),
  }),
  message: defineSchema("voxmesh.message.v1", {
    workspace: str().indexed(),
    messageId: str().indexed(),
    correlationId: str().indexed(),
    workflowId: str().indexed(),
    taskId: str().indexed(),
    sender: str().indexed(),
    receiver: str().indexed(),
    messageType: str().indexed(),
    payload: bytes(),
  }),
  workflow: defineSchema("voxmesh.workflow.v1", {
    workspace: str().indexed(),
    workflowId: str().indexed(),
    status: str().indexed(),
    intent: str().indexed(),
    payload: bytes(),
  }),
  identity: defineSchema("voxmesh.identity.v1", {
    workspace: str().indexed(),
    subject: str().indexed(),
    provider: str().indexed(),
    payload: bytes(),
  }),
} as const

const enc = (value: unknown) => stringToBytes(JSON.stringify(value))
/** Clamp to Arkiv's 128-byte str limit (ASCII ids are well under it). */
const s = (value: string | null | undefined) => {
  const v = value ?? ""
  let out = v
  while (new TextEncoder().encode(out).length > 128) out = out.slice(0, -1)
  return out
}

type ValueLike = { type: string; value: unknown }
type Row = Record<string, unknown> & { $key?: Hex; $owner?: Hex; $expiresAt?: bigint; $createdAt?: bigint }

function decodePayload<T>(row: Row): T {
  const payload = row.payload as ValueLike | undefined
  if (!payload || typeof payload.value !== "string" || !isHex(payload.value)) {
    throw new AppError("ARKIV_DECODE", `Entity ${row.$key ?? "?"} has no payload`, 500)
  }
  return JSON.parse(hexToString(payload.value)) as T
}

function toStored<T>(row: Row): Stored<T> {
  return {
    key: row.$key ?? "",
    owner: row.$owner ?? null,
    expiresAtBlock: row.$expiresAt !== undefined ? row.$expiresAt.toString() : null,
    data: decodePayload<T>(row),
  }
}

export type ArkivOptions = {
  privateKey: string
  accessKey: string
  workspace: string
  taskTtlHours: number
  agentTtlDays: number
}

export class ArkivCoordinationStore implements CoordinationStore {
  readonly mode = "live" as const
  readonly ownerAddress: Hex
  private readonly publicClient
  private readonly walletClient
  private readonly writes = new SerialQueue()
  private readonly chain
  private lastError: string | null = null
  writeCount = 0

  constructor(private readonly opts: ArkivOptions) {
    if (!isHex(opts.privateKey) || opts.privateKey.length !== 66) {
      throw new AppError("CONFIG", "ARKIV_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key", 500)
    }
    const account = privateKeyToAccount(opts.privateKey)
    this.ownerAddress = account.address
    this.chain = rabdi({ accessKey: opts.accessKey })
    this.publicClient = createPublicClient({ chain: this.chain, transport: http() })
    this.walletClient = createWalletClient({ chain: this.chain, transport: http(), account })
  }

  private get taskTtl() {
    return ExpirationTime.fromHours(this.opts.taskTtlHours)
  }

  private write<T>(label: string, run: () => Promise<T>): Promise<T> {
    return this.writes.run(async () => {
      try {
        const out = await run()
        this.writeCount++
        this.lastError = null
        return out
      } catch (error) {
        if (error instanceof AppError) throw error
        this.lastError = redact(errorMessage(error))
        throw new AppError("ARKIV_WRITE_FAILED", `Arkiv ${label} failed: ${this.lastError}`, 502, undefined, true)
      }
    })
  }

  private async read<T>(label: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof AppError) throw error
      this.lastError = redact(errorMessage(error))
      throw new AppError("ARKIV_READ_FAILED", `Arkiv ${label} failed: ${this.lastError}`, 502, undefined, true)
    }
  }


  /**
   * Dynamic filters (optional conditions) cannot be expressed through the schema-checked builder,
   * so these queries select explicit fields and filter on the schema tag (`arkiv.schema`) themselves.
   */
  private async scopedQuery(label: string, schemaName: string, conditions: Expression[], limit: number): Promise<Row[]> {
    const res = await this.read(label, () =>
      this.publicClient
        .select({ $key: true, $owner: true, $expiresAt: true, payload: true })
        .where(and(eq("workspace", this.opts.workspace), eq("arkiv.schema", schemaName), ...conditions))
        .ownedBy(this.ownerAddress)
        .limit(Math.min(limit, 100))
        .fetch(),
    )
    return res.entities as unknown as Row[]
  }

  async init(): Promise<void> {
    await this.read("block timing", () => this.publicClient.getBlockTiming())
  }

  async status(): Promise<IntegrationStatus> {
    const meta: IntegrationStatus["meta"] = {
      chain: this.chain.name,
      chainId: this.chain.id,
      owner: this.ownerAddress,
      workspace: this.opts.workspace,
      explorer: this.chain.blockExplorers?.default.url ?? null,
      writes: this.writeCount,
      accessKey: this.opts.accessKey ? "configured" : "public endpoint (rate limited)",
    }
    try {
      const [timing, balance] = await Promise.all([
        this.publicClient.getBlockTiming(),
        this.publicClient.getBalance({ address: this.ownerAddress }),
      ])
      return {
        name: "Arkiv",
        mode: "live",
        connected: true,
        detail: balance === 0n ? "Connected, but signer has 0 tGLM — fund it at hub.arkiv.network/faucet" : "Connected to Arkiv Rabdi testnet",
        meta: {
          ...meta,
          currentBlock: timing.currentBlock.toString(),
          blockDurationSec: timing.blockDuration,
          balanceWei: balance.toString(),
          lastError: this.lastError,
        },
        checkedAt: nowIso(),
      }
    } catch (error) {
      return { name: "Arkiv", mode: "live", connected: false, detail: redact(errorMessage(error)), meta, checkedAt: nowIso() }
    }
  }

  /* ───────────── agents ───────────── */

  async upsertAgents(agents: AgentRecord[]): Promise<Stored<AgentRecord>[]> {
    const existing = await this.listAgents()
    const creates: CreateEntityParameters<typeof ArkivSchemas.agent>[] = []
    const patches: PatchEntityParameters<typeof ArkivSchemas.agent>[] = []
    for (const a of agents) {
      const found = existing.find((e) => e.data.agentId === a.agentId)
      const values = {
        workspace: this.opts.workspace,
        agentId: s(a.agentId),
        status: s(a.status),
        primaryCapability: s(a.capabilities[0]),
        ensName: s(a.ensName),
        payload: enc(a),
      }
      if (found) {
        const same = JSON.stringify({ ...found.data, registeredAt: "" }) === JSON.stringify({ ...a, registeredAt: "" })
        if (!same) patches.push({ schema: ArkivSchemas.agent, entityKey: found.key as Hex, set: values })
      } else {
        creates.push({ schema: ArkivSchemas.agent, values, expiration: ExpirationTime.fromDays(this.opts.agentTtlDays) })
      }
    }
    if (creates.length || patches.length) {
      await this.write("agent registration", () => this.walletClient.executeBatch({ creates, patches }))
    }
    return this.listAgents()
  }

  async listAgents(): Promise<Stored<AgentRecord>[]> {
    const res = await this.read("list agents", () =>
      this.publicClient
        .select()
        .from(ArkivSchemas.agent)
        .where(eq("workspace", this.opts.workspace))
        .ownedBy(this.ownerAddress)
        .limit(50)
        .fetch(),
    )
    return res.entities.map((r) => toStored<AgentRecord>(r as unknown as Row))
  }

  /* ───────────── tasks ───────────── */

  private taskValues(t: Task) {
    return {
      workspace: this.opts.workspace,
      taskId: s(t.id),
      workflowId: s(t.workflowId),
      taskType: s(t.type),
      status: s(t.status),
      capability: s(t.requiredCapability),
      claimedBy: s(t.claimedBy),
      priority: i32(t.priority),
      payload: enc(t),
    }
  }

  private messageCreate(m: AgentMessage) {
    return {
      schema: ArkivSchemas.message,
      values: {
        workspace: this.opts.workspace,
        messageId: s(m.id),
        correlationId: s(m.correlationId),
        workflowId: s(m.workflowId),
        taskId: s(m.taskId),
        sender: s(m.senderAgentId),
        receiver: s(m.receiverAgentId),
        messageType: s(m.messageType),
        payload: enc(m),
      },
      expiration: this.taskTtl,
    }
  }

  async createTasks(tasks: Task[], messages: AgentMessage[]) {
    const creates = [
      ...tasks.map((t) => ({ schema: ArkivSchemas.task, values: this.taskValues(t), expiration: this.taskTtl })),
      ...messages.map((m) => this.messageCreate(m)),
    ]
    const res = await this.write("create tasks", () => this.walletClient.executeBatch({ creates }))
    const taskKeys: Record<string, string> = {}
    const messageKeys: Record<string, string> = {}
    tasks.forEach((t, i) => (taskKeys[t.id] = res.createdEntities[i]))
    messages.forEach((m, i) => (messageKeys[m.id] = res.createdEntities[tasks.length + i]))
    return { txHash: res.txHash, taskKeys, messageKeys }
  }

  async queryTasks(filter: TaskFilter): Promise<Stored<Task>[]> {
    const conditions: Expression[] = []
    if (filter.workflowId) conditions.push(eq("workflowId", filter.workflowId))
    if (filter.status) conditions.push(eq("status", filter.status))
    if (filter.capability) conditions.push(eq("capability", filter.capability))
    const rows = await this.scopedQuery("task", "voxmesh.task.v1", conditions, filter.limit ?? 50)
    return rows.map((r) => toStored<Task>(r))
  }


  async getTask(key: string): Promise<Stored<Task> | null> {
    if (!isHex(key)) return null
    try {
      const row = await this.publicClient.getEntity(key, ArkivSchemas.task)
      return toStored<Task>(row as unknown as Row)
    } catch (error) {
      if (/not found|does not exist|no entity/i.test(errorMessage(error))) return null
      throw new AppError("ARKIV_READ_FAILED", `Arkiv get task failed: ${redact(errorMessage(error))}`, 502, undefined, true)
    }
  }

  private patchTaskBatch(key: string, next: Task) {
    const v = this.taskValues(next)
    return {
      schema: ArkivSchemas.task,
      entityKey: key as Hex,
      set: { status: v.status, claimedBy: v.claimedBy, payload: v.payload },
    }
  }

  async claimTask(key: string, agentId: string, message: AgentMessage | null) {
    // Read-check-write runs inside the signer's serial queue, so claims from this runtime cannot interleave.
    return this.writes.run(async () => {
      const current = await this.getTask(key)
      if (!current) throw notFound(`Task entity ${key}`)
      if (current.data.status !== "open") throw conflict(`Task ${current.data.id} is ${current.data.status}, not open`)
      const task: Task = {
        ...current.data,
        status: "claimed",
        claimedBy: agentId,
        assignedAgent: agentId as Task["assignedAgent"],
        updatedAt: nowIso(),
      }
      try {
        const patches = [this.patchTaskBatch(key, task)]
        const res = message
          ? await this.walletClient.executeBatch({ patches, creates: [this.messageCreate(message)] })
          : await this.walletClient.executeBatch({ patches })
        this.writeCount++
        return { txHash: res.txHash as string, task }
      } catch (error) {
        throw new AppError("ARKIV_WRITE_FAILED", `Arkiv claim failed: ${redact(errorMessage(error))}`, 502, undefined, true)
      }
    })
  }

  async setTaskStatus(key: string, status: TaskStatus) {
    const current = await this.getTask(key)
    if (!current) throw notFound(`Task entity ${key}`)
    const next = { ...current.data, status, updatedAt: nowIso() }
    const res = await this.write("task status", () => this.walletClient.executeBatch({ patches: [this.patchTaskBatch(key, next)] }))
    return { txHash: res.txHash as string }
  }

  async completeTask(key: string, record: ExecutionRecord, message: AgentMessage | null) {
    const current = await this.getTask(key)
    if (!current) throw notFound(`Task entity ${key}`)
    const res = await this.write("complete task", () =>
      this.walletClient.executeBatch({
        creates: [
          {
            schema: ArkivSchemas.execution,
            values: {
              workspace: this.opts.workspace,
              executionId: s(record.id),
              workflowId: s(record.workflowId),
              taskId: s(record.taskId),
              agentId: s(record.agentId),
              status: s(record.status),
              inferenceRequestId: s(record.inferenceRequestIds[0]),
              payload: enc(record),
            },
            expiration: ExpirationTime.fromDays(7),
          },
          ...(message ? [this.messageCreate(message)] : []),
        ],
      }),
    )
    const resultKey = res.createdEntities[0]
    const next: Task = {
      ...current.data,
      status: record.status === "success" ? "completed" : "failed",
      resultEntityKey: resultKey,
      updatedAt: nowIso(),
    }
    // Task status is patched after the result entity exists so the reference is never dangling.
    await this.write("task status", () => this.walletClient.executeBatch({ patches: [this.patchTaskBatch(key, next)] }))
    return { txHash: res.txHash as string, resultKey }
  }

  /* ───────────── executions / messages ───────────── */

  async getExecution(key: string): Promise<Stored<ExecutionRecord> | null> {
    if (!isHex(key)) return null
    const row = await this.read("get execution", () => this.publicClient.getEntity(key, ArkivSchemas.execution))
    return toStored<ExecutionRecord>(row as unknown as Row)
  }

  async listExecutions(filter: { workflowId?: string; taskId?: string; limit?: number }) {
    const conditions: Expression[] = []
    if (filter.workflowId) conditions.push(eq("workflowId", filter.workflowId))
    if (filter.taskId) conditions.push(eq("taskId", filter.taskId))
    const rows = await this.scopedQuery("execution", "voxmesh.execution.v1", conditions, filter.limit ?? 50)
    return rows.map((r) => toStored<ExecutionRecord>(r))
  }


  async listMessages(filter: { workflowId?: string; limit?: number }) {
    const conditions: Expression[] = []
    if (filter.workflowId) conditions.push(eq("workflowId", filter.workflowId))
    const rows = await this.scopedQuery("message", "voxmesh.message.v1", conditions, filter.limit ?? 50)
    return rows.map((r) => toStored<AgentMessage>(r))
  }


  async saveWorkflow(record: WorkflowRecord) {
    const res = await this.write("save workflow", () =>
      this.walletClient.createEntity(
        ArkivSchemas.workflow,
        {
          workspace: this.opts.workspace,
          workflowId: s(record.workflowId),
          status: s(record.status),
          intent: s(record.intent),
          payload: enc(record),
        },
        { expiration: ExpirationTime.fromDays(7) },
      ),
    )
    return { txHash: res.txHash as string, key: res.entityKey as string }
  }

  async recordIdentity(record: IdentityRecord) {
    const res = await this.write("record identity", () =>
      this.walletClient.createEntity(
        ArkivSchemas.identity,
        { workspace: this.opts.workspace, subject: s(record.subject), provider: s(record.provider), payload: enc(record) },
        { expiration: ExpirationTime.fromDays(7) },
      ),
    )
    return { txHash: res.txHash as string, key: res.entityKey as string }
  }

  /* ───────────── explorer ───────────── */

  async explore(kind: EntityKind, limit: number): Promise<ExplorerEntity[]> {
    const schema = ArkivSchemas[kind]
    const [timing, res] = await Promise.all([
      this.read("block timing", () => this.publicClient.getBlockTiming()),
      this.read(`explore ${kind}`, () =>
        this.publicClient
          .select({ $key: true, $owner: true, $expiresAt: true, $createdAt: true, $attributes: true })
          .where(and(eq("workspace", this.opts.workspace), eq("arkiv.schema", schema.name ?? "")))
          .ownedBy(this.ownerAddress)
          .limit(Math.min(limit, 100))
          .fetch(),
      ),
    ])
    return res.entities.map((raw) => {
      const row = raw as unknown as Row & { $attributes?: Record<string, ValueLike> }
      const attributes: ExplorerEntity["attributes"] = {}
      let payloadPreview: string | null = null
      for (const [name, v] of Object.entries(row.$attributes ?? {})) {
        if (v.type === "bytes" && typeof v.value === "string" && isHex(v.value)) {
          payloadPreview = hexToString(v.value).slice(0, 600)
        } else if (typeof v.value === "bigint") {
          attributes[name] = v.value.toString()
        } else if (typeof v.value === "string" || typeof v.value === "number" || typeof v.value === "boolean") {
          attributes[name] = v.value
        }
      }
      const expiresAt = row.$expiresAt
      const approx =
        expiresAt !== undefined
          ? new Date(Date.now() + Number(expiresAt - timing.currentBlock) * timing.blockDuration * 1000).toISOString()
          : null
      return {
        key: row.$key ?? "",
        kind,
        owner: row.$owner ?? null,
        expiresAtBlock: expiresAt?.toString() ?? null,
        expiresAtApprox: approx,
        createdAtBlock: row.$createdAt?.toString() ?? null,
        attributes,
        payloadPreview,
      }
    })
  }
}
