import type { ZodType } from "zod"
import type {
  AgentId,
  Capability,
  ExecutionTrace,
  InferenceMetadata,
  Task,
} from "../../shared/schemas"
import type { InferenceAdapter, InferencePurpose, ChatMessage } from "../adapters/inference/types"
import type { CoordinationStore, ExecutionRecord } from "../adapters/store/types"
import { extractJson } from "../lib/async"
import type { ToolRegistry } from "../tools/registry"

export type TraceInput = Omit<ExecutionTrace, "id" | "workflowId" | "timestamp" | "inferenceRequestId" | "arkivEntityId" | "txHash" | "duration" | "taskId"> &
  Partial<Pick<ExecutionTrace, "inferenceRequestId" | "arkivEntityId" | "txHash" | "duration" | "taskId">>

export type DependencyResult = { taskId: string; stepId: string; resultKey: string; record: ExecutionRecord }

export interface AgentContext {
  workflowId: string
  requestId: string
  command: string
  depth: number
  signal: AbortSignal
  inference: InferenceAdapter
  tools: ToolRegistry
  store: CoordinationStore
  /** Outputs of dependency tasks, read back from the coordination store (Arkiv), keyed by plan step id. */
  dependencies: Record<string, DependencyResult>
  trace(entry: TraceInput): void
  onInference(meta: InferenceMetadata): void
}

export type AgentOutput = {
  result: Record<string, unknown>
  inference: InferenceMetadata[]
}

/** Common contract every VoxMesh agent implements. */
export interface Agent {
  readonly id: AgentId
  readonly name: string
  readonly description: string
  readonly capabilities: Capability[]
  execute(task: Task, context: AgentContext): Promise<AgentOutput>
}

/**
 * Calls the model and validates its JSON against a schema. One repair round on invalid output;
 * if that also fails, returns `value: null` so the caller can use its deterministic fallback.
 * Inference transport errors propagate (the executor retries transient ones).
 */
export async function inferStructured<T>(
  ctx: AgentContext,
  agentId: string,
  purpose: InferencePurpose,
  messages: ChatMessage[],
  schema: ZodType<T>,
  context: Record<string, unknown>,
  taskId: string | null,
): Promise<{ value: T | null; inference: InferenceMetadata[]; error: string | null }> {
  const inference: InferenceMetadata[] = []
  let convo = messages
  let lastError: string | null = null
  for (let round = 0; round < 2; round++) {
    const res = await ctx.inference.complete({ agentId, purpose, messages: convo, context, signal: ctx.signal })
    inference.push(res.metadata)
    ctx.onInference(res.metadata)
    ctx.trace({
      agentId,
      taskId,
      action: "inference.completed",
      status: "ok",
      detail: `${res.metadata.provider === "0g" ? "0G" : "MOCK"} ${purpose} inference via ${res.metadata.model}${round > 0 ? " (repair)" : ""}`,
      inferenceRequestId: res.metadata.requestId,
      duration: res.metadata.latencyMs,
      data: {
        provider: res.metadata.provider,
        providerAddress: res.metadata.providerAddress,
        teeVerified: res.metadata.teeVerified,
        totalCost: res.metadata.billing?.totalCost ?? null,
        tokens: res.metadata.usage?.totalTokens ?? null,
      },
    })
    try {
      const parsed = schema.safeParse(extractJson(res.content))
      if (parsed.success) return { value: parsed.data, inference, error: null }
      lastError = parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    convo = [
      ...messages,
      { role: "assistant", content: res.content.slice(0, 6000) },
      { role: "user", content: `Your previous reply was invalid (${lastError}). Reply with ONLY the corrected JSON object, no prose.` },
    ]
  }
  return { value: null, inference, error: lastError }
}
