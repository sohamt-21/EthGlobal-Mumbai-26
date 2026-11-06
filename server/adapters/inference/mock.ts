import { randomUUID } from "node:crypto"
import type { IntegrationStatus, ResearchReport, SecurityAssessment, StaticSignal } from "../../../shared/schemas"
import { heuristicAggregate, heuristicPlan, heuristicResearch, heuristicSecurity } from "../../agents/heuristics"
import { nowIso, sleep } from "../../lib/async"
import type { ContractSummary } from "../../tools/solidity"
import type { InferenceAdapter, InferenceRequest, InferenceResponse } from "./types"

/**
 * DEVELOPMENT MOCK — not 0G. Deterministic output derived from the structured prompt context.
 * Request IDs are prefixed `mock_`, provider is "mock", and the UI labels every call as MOCK.
 */
export class MockInferenceAdapter implements InferenceAdapter {
  readonly mode = "mock" as const
  readonly model = "voxmesh-mock-v1"
  calls = 0

  constructor(
    private readonly latencyMs = 120,
    /** Test hook: throw on specific calls to exercise retry / failure paths. */
    private readonly failWhen?: (req: InferenceRequest, call: number) => Error | null,
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    this.calls += 1
    const injected = this.failWhen?.(request, this.calls)
    if (injected) throw injected
    const started = Date.now()
    await sleep(this.latencyMs)
    const ctx = request.context ?? {}
    let content: unknown
    switch (request.purpose) {
      case "plan":
        content = heuristicPlan(String(ctx.command ?? ""), Boolean(ctx.hasSource))
        break
      case "research":
        content = heuristicResearch(ctx.summary as ContractSummary, (ctx.signals as StaticSignal[]) ?? [])
        break
      case "security":
        content = heuristicSecurity((ctx.signals as StaticSignal[]) ?? [], (ctx.research as ResearchReport | null) ?? null)
        break
      case "aggregate":
        content = heuristicAggregate(
          String(ctx.command ?? ""),
          (ctx.research as ResearchReport | null) ?? null,
          (ctx.security as SecurityAssessment | null) ?? null,
        )
        break
    }
    return {
      content: JSON.stringify(content),
      metadata: {
        provider: "mock",
        requestId: `mock_${randomUUID()}`,
        model: this.model,
        providerAddress: null,
        teeVerified: null,
        trustMode: null,
        billing: null,
        usage: null,
        latencyMs: Date.now() - started,
        completionId: null,
        purpose: request.purpose,
        agentId: request.agentId,
        timestamp: nowIso(),
      },
    }
  }

  async status(): Promise<IntegrationStatus> {
    return {
      name: "0G Inference",
      mode: "mock",
      connected: false,
      detail: "DEV MOCK — ZG_API_KEY not configured. Responses are deterministic and NOT produced by 0G.",
      meta: { model: this.model },
      checkedAt: nowIso(),
    }
  }
}
