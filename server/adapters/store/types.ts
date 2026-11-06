import type {
  AgentMessage,
  Capability,
  EntityKind,
  ExplorerEntity,
  IntegrationStatus,
  Task,
  TaskStatus,
} from "../../../shared/schemas"

export type AgentRecord = {
  agentId: string
  name: string
  description: string
  capabilities: string[]
  endpoint: string
  ensName: string | null
  owner: string
  status: "idle" | "busy" | "offline"
  registeredAt: string
}

export type ExecutionRecord = {
  id: string
  workflowId: string
  taskId: string
  agentId: string
  status: "success" | "failed"
  inferenceRequestIds: string[]
  inferenceProvider: string
  durationMs: number
  output: Record<string, unknown>
  createdAt: string
}

export type WorkflowRecord = {
  workflowId: string
  command: string
  status: string
  intent: string
  taskIds: string[]
  taskKeys: string[]
  overallRisk: string | null
  riskScore: number | null
  initiatedBy: string
  inferenceRequestIds: string[]
  startedAt: string
  completedAt: string | null
}

export type IdentityRecord = {
  subject: string
  provider: string
  verifiedAt: string
  permissions: string[]
  environment: string
}

export type Stored<T> = {
  key: string
  owner: string | null
  expiresAtBlock: string | null
  data: T
}

export type TxRef = { txHash: string | null }

export type TaskFilter = {
  workflowId?: string
  status?: TaskStatus
  capability?: Capability
  limit?: number
}

/**
 * Decentralised coordination layer. Arkiv is the production implementation; the in-memory
 * implementation exists for tests and credential-less development and reports mode "memory".
 */
export interface CoordinationStore {
  readonly mode: "live" | "memory"
  /** Signer / owner address entities are written from (null for memory). */
  readonly ownerAddress: string | null
  init(): Promise<void>
  status(): Promise<IntegrationStatus>

  upsertAgents(agents: AgentRecord[]): Promise<Stored<AgentRecord>[]>
  listAgents(): Promise<Stored<AgentRecord>[]>

  createTasks(tasks: Task[], messages: AgentMessage[]): Promise<TxRef & { taskKeys: Record<string, string>; messageKeys: Record<string, string> }>
  queryTasks(filter: TaskFilter): Promise<Stored<Task>[]>
  getTask(key: string): Promise<Stored<Task> | null>
  /** Atomically moves an open task to claimed. Throws CONFLICT if already claimed. */
  claimTask(key: string, agentId: string, message: AgentMessage | null): Promise<TxRef & { task: Task }>
  setTaskStatus(key: string, status: TaskStatus): Promise<TxRef>
  /** Stores the execution record and marks the task completed/failed in one write. */
  completeTask(key: string, record: ExecutionRecord, message: AgentMessage | null): Promise<TxRef & { resultKey: string }>

  getExecution(key: string): Promise<Stored<ExecutionRecord> | null>
  listExecutions(filter: { workflowId?: string; taskId?: string; limit?: number }): Promise<Stored<ExecutionRecord>[]>
  listMessages(filter: { workflowId?: string; limit?: number }): Promise<Stored<AgentMessage>[]>

  saveWorkflow(record: WorkflowRecord): Promise<TxRef & { key: string }>
  recordIdentity(record: IdentityRecord): Promise<TxRef & { key: string }>

  explore(kind: EntityKind, limit: number): Promise<ExplorerEntity[]>
}
