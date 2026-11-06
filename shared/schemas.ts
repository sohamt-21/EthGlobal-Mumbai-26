import { z } from "zod"

/* ──────────────────────────── primitives ──────────────────────────── */

export const AgentIdSchema = z.enum(["supervisor", "research", "security", "metamask", "liquidity"])
export type AgentId = z.infer<typeof AgentIdSchema>

export const CapabilitySchema = z.enum([
  "planning",
  "delegation",
  "aggregation",
  "contract_research",
  "source_analysis",
  "security_review",
  "risk_assessment",
  "wallet_transfer",
  "market_research",
  "liquidity_simulation",
])
export type Capability = z.infer<typeof CapabilitySchema>

export const IntegrationModeSchema = z.enum(["live", "mock", "memory", "dev-bypass", "disabled"])
export type IntegrationMode = z.infer<typeof IntegrationModeSchema>

/* ──────────────────────────── Agent ──────────────────────────── */

export const AgentSchema = z.object({
  id: AgentIdSchema,
  name: z.string(),
  description: z.string(),
  capabilities: z.array(CapabilitySchema),
  owner: z.string(),
  endpoint: z.string(),
  identity: z.object({
    ensName: z.string().nullable(),
    did: z.string(),
    humanVerified: z.boolean(),
  }),
  status: z.enum(["idle", "busy", "offline"]),
  createdAt: z.string(),
  allowedTools: z.array(z.string()),
})
export type Agent = z.infer<typeof AgentSchema>

export const RegisterAgentInputSchema = z.object({
  id: AgentIdSchema,
  endpoint: z.string().url().optional(),
  ensName: z
    .string()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/, "must be an ENS name")
    .optional(),
})
export type RegisterAgentInput = z.infer<typeof RegisterAgentInputSchema>

/* ──────────────────────────── Task ──────────────────────────── */

export const TaskTypeSchema = z.enum(["research", "security_review", "wallet_transfer", "market_research", "liquidity_simulation", "aggregate"])
export type TaskType = z.infer<typeof TaskTypeSchema>

export const TaskStatusSchema = z.enum(["open", "claimed", "running", "completed", "failed", "cancelled"])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  type: TaskTypeSchema,
  description: z.string(),
  requiredCapability: CapabilitySchema,
  createdBy: z.string(),
  assignedAgent: AgentIdSchema.nullable(),
  claimedBy: z.string().nullable(),
  status: TaskStatusSchema,
  priority: z.number().int().min(0).max(10),
  dependsOn: z.array(z.string()),
  input: z.record(z.string(), z.unknown()),
  resultEntityKey: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
})
export type Task = z.infer<typeof TaskSchema>

export const CreateTaskInputSchema = z.object({
  workflowId: z.string().min(1).max(80).optional(),
  type: TaskTypeSchema,
  description: z.string().min(3).max(2000),
  requiredCapability: CapabilitySchema,
  priority: z.number().int().min(0).max(10).default(5),
  input: z.record(z.string(), z.unknown()).default({}),
})
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export const CompleteTaskInputSchema = z.object({
  agentId: AgentIdSchema,
  status: z.enum(["completed", "failed"]),
  output: z.record(z.string(), z.unknown()),
  inferenceRequestId: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative().default(0),
})
export type CompleteTaskInput = z.infer<typeof CompleteTaskInputSchema>

/* ──────────────────────────── Messages ──────────────────────────── */

export const MessageTypeSchema = z.enum([
  "task.delegate",
  "task.claimed",
  "task.result",
  "task.error",
  "context.share",
])
export type MessageType = z.infer<typeof MessageTypeSchema>

export const AgentMessageSchema = z.object({
  id: z.string(),
  correlationId: z.string(),
  workflowId: z.string(),
  taskId: z.string(),
  senderAgentId: z.string(),
  receiverAgentId: z.string(),
  messageType: MessageTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
})
export type AgentMessage = z.infer<typeof AgentMessageSchema>

/* ──────────────────────────── Inference ──────────────────────────── */

export const InferenceMetadataSchema = z.object({
  provider: z.enum(["0g", "mock"]),
  requestId: z.string(),
  model: z.string(),
  providerAddress: z.string().nullable(),
  teeVerified: z.boolean().nullable(),
  trustMode: z.string().nullable(),
  billing: z
    .object({ inputCost: z.string(), outputCost: z.string(), totalCost: z.string() })
    .nullable(),
  usage: z
    .object({ promptTokens: z.number(), completionTokens: z.number(), totalTokens: z.number() })
    .nullable(),
  latencyMs: z.number(),
  completionId: z.string().nullable(),
  purpose: z.string(),
  agentId: z.string(),
  timestamp: z.string(),
})
export type InferenceMetadata = z.infer<typeof InferenceMetadataSchema>

/* ──────────────────────────── Plan ──────────────────────────── */

export const IntentSchema = z.enum(["full_audit", "contract_research", "security_review", "wallet_transfer", "prediction_market_simulation", "general_question"])
export type Intent = z.infer<typeof IntentSchema>

export const PlanStepSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  type: TaskTypeSchema,
  capability: CapabilitySchema,
  description: z.string().min(3).max(500),
  dependsOn: z.array(z.string()).max(4).default([]),
})
export type PlanStep = z.infer<typeof PlanStepSchema>

export const ExecutionPlanSchema = z.object({
  intent: IntentSchema,
  reasoning: z.string().max(1200),
  steps: z.array(PlanStepSchema).max(4),
  directAnswer: z.string().max(4000).nullable().default(null),
})
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>

/* ──────────────────────────── Agent results ──────────────────────────── */

export const SeveritySchema = z.enum(["critical", "high", "medium", "low", "info"])
export type Severity = z.infer<typeof SeveritySchema>

export const StaticSignalSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  category: z.string(),
  line: z.number().int().nullable(),
  snippet: z.string(),
})
export type StaticSignal = z.infer<typeof StaticSignalSchema>

export const ResearchReportSchema = z.object({
  contractName: z.string(),
  summary: z.string(),
  components: z.array(z.string()).default([]),
  privilegedRoles: z.array(z.string()).default([]),
  externalInteractions: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]),
})
export type ResearchReport = z.infer<typeof ResearchReportSchema>

export const SecurityFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  category: z.string(),
  description: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
})
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>

export const SecurityAssessmentSchema = z.object({
  overallRisk: SeveritySchema,
  riskScore: z.number().min(0).max(100),
  summary: z.string(),
  findings: z.array(SecurityFindingSchema).max(20),
})
export type SecurityAssessment = z.infer<typeof SecurityAssessmentSchema>

export const AgentResultSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  status: z.enum(["success", "failed"]),
  result: z.record(z.string(), z.unknown()),
  inference: z.array(InferenceMetadataSchema),
  durationMs: z.number(),
  attempts: z.number().int(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).nullable(),
})
export type AgentResult = z.infer<typeof AgentResultSchema>

/* ──────────────────────────── Trace / workflow ──────────────────────────── */

export const TraceActionSchema = z.enum([
  "workflow.started",
  "plan.created",
  "plan.fallback",
  "task.created",
  "task.claimed",
  "task.started",
  "task.retry",
  "task.completed",
  "task.failed",
  "task.skipped",
  "tool.invoked",
  "inference.completed",
  "inference.failed",
  "message.sent",
  "arkiv.write",
  "arkiv.read",
  "workflow.completed",
  "workflow.failed",
])
export type TraceAction = z.infer<typeof TraceActionSchema>

export const ExecutionTraceSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  taskId: z.string().nullable(),
  agentId: z.string(),
  action: TraceActionSchema,
  detail: z.string(),
  inferenceRequestId: z.string().nullable(),
  arkivEntityId: z.string().nullable(),
  txHash: z.string().nullable(),
  status: z.enum(["ok", "error", "info"]),
  duration: z.number().nullable(),
  timestamp: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
})
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>

export const WorkflowStatusSchema = z.enum(["planning", "running", "completed", "partial", "failed"])
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>

export const FinalReportSchema = z.object({
  title: z.string(),
  markdown: z.string(),
  spokenSummary: z.string(),
  overallRisk: SeveritySchema.nullable(),
  riskScore: z.number().nullable(),
  disclaimer: z.string(),
})
export type FinalReport = z.infer<typeof FinalReportSchema>

export const WorkflowSchema = z.object({
  id: z.string(),
  command: z.string(),
  status: WorkflowStatusSchema,
  plan: ExecutionPlanSchema.nullable(),
  tasks: z.array(TaskSchema.extend({ arkivEntityKey: z.string().nullable() })),
  results: z.record(z.string(), AgentResultSchema),
  messages: z.array(AgentMessageSchema),
  trace: z.array(ExecutionTraceSchema),
  inference: z.array(InferenceMetadataSchema),
  finalReport: FinalReportSchema.nullable(),
  arkivRecordKey: z.string().nullable(),
  initiatedBy: z.object({ subject: z.string(), verified: z.boolean(), provider: z.string() }),
  agentCalls: z.number(),
  error: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
})
export type Workflow = z.infer<typeof WorkflowSchema>

export const ExecuteWorkflowInputSchema = z.object({
  command: z.string().trim().min(3).max(4000),
  contractSource: z.string().max(48_000).optional(),
  sampleContractId: z.string().max(64).optional(),
  channel: z.enum(["voice", "text"]).default("text"),
})
export type ExecuteWorkflowInput = z.infer<typeof ExecuteWorkflowInputSchema>

/* ──────────────────────────── Identity ──────────────────────────── */

export const PermissionSchema = z.enum(["workflow:execute", "agent:register", "agent:delegate", "task:write"])
export type Permission = z.infer<typeof PermissionSchema>

export const IdentitySchema = z.object({
  id: z.string(),
  /** sha256 of the World ID nullifier — never the raw proof */
  subject: z.string(),
  verificationProvider: z.enum(["world-id", "dev-bypass"]),
  verificationStatus: z.enum(["verified", "failed", "expired"]),
  verifiedAt: z.string(),
  expiresAt: z.string(),
  permissions: z.array(PermissionSchema),
  credential: z.string().nullable(),
  environment: z.string(),
  arkivEntityKey: z.string().nullable(),
})
export type Identity = z.infer<typeof IdentitySchema>

export const IdentityEventSchema = z.object({
  id: z.string(),
  type: z.enum(["verify.success", "verify.failed", "session.expired", "permission.denied", "rp.signed"]),
  detail: z.string(),
  subject: z.string().nullable(),
  timestamp: z.string(),
})
export type IdentityEvent = z.infer<typeof IdentityEventSchema>

/* ──────────────────────────── Arkiv explorer ──────────────────────────── */

export const EntityKindSchema = z.enum(["agent", "task", "execution", "message", "workflow", "identity"])
export type EntityKind = z.infer<typeof EntityKindSchema>

export const ExplorerEntitySchema = z.object({
  key: z.string(),
  kind: EntityKindSchema,
  owner: z.string().nullable(),
  expiresAtBlock: z.string().nullable(),
  expiresAtApprox: z.string().nullable(),
  createdAtBlock: z.string().nullable(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  payloadPreview: z.string().nullable(),
})
export type ExplorerEntity = z.infer<typeof ExplorerEntitySchema>

/* ──────────────────────────── Integrations ──────────────────────────── */

export const IntegrationStatusSchema = z.object({
  name: z.string(),
  mode: IntegrationModeSchema,
  connected: z.boolean(),
  detail: z.string(),
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  checkedAt: z.string(),
})
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>

/* ──────────────────────────── API envelope / events ──────────────────────────── */

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export type RuntimeEvent = {
  id: string
  workflowId: string
  type: "trace" | "workflow" | "message"
  trace?: ExecutionTrace
  workflow?: Workflow
  message?: AgentMessage
  timestamp: string
}

export type RuntimeStats = {
  agents: number
  activeTasks: number
  completedTasks: number
  failedTasks: number
  workflows: number
  inferenceCalls: number
  lastInferenceAt: string | null
}
