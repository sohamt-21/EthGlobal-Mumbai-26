import type { InferenceMetadata, IntegrationStatus } from "../../../shared/schemas"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type InferencePurpose = "plan" | "research" | "security" | "aggregate"

export type InferenceRequest = {
  agentId: string
  purpose: InferencePurpose
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  /**
   * Structured inputs the prompt was built from. The live 0G adapter ignores this (the model only
   * sees `messages`); the mock adapter uses it to produce deterministic, clearly-labelled output.
   */
  context?: Record<string, unknown>
}

export type InferenceResponse = {
  content: string
  metadata: InferenceMetadata
}

export interface InferenceAdapter {
  readonly mode: "live" | "mock"
  readonly model: string
  complete(request: InferenceRequest): Promise<InferenceResponse>
  status(): Promise<IntegrationStatus>
}
