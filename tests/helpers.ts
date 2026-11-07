import { MockInferenceAdapter } from "../server/adapters/inference/mock"
import type { InferenceAdapter, InferenceRequest, InferenceResponse } from "../server/adapters/inference/types"
import { MemoryCoordinationStore } from "../server/adapters/store/memory"
import type { CoordinationStore } from "../server/adapters/store/types"
import { testConfig, type AppConfig } from "../server/config"
import { createRuntime } from "../server/runtime/container"

export const FULL_DEMO_COMMAND =
  "Start a multi-agent workflow. Ask the research agent to analyse this smart contract and ask the security agent to review the findings. Return a combined report."

export async function makeRuntime(
  opts: { cfg?: Partial<Record<keyof AppConfig, string>>; inference?: InferenceAdapter; fetchImpl?: typeof fetch; store?: CoordinationStore } = {},
) {
  const store = opts.store ?? new MemoryCoordinationStore()
  const inference = opts.inference ?? new MockInferenceAdapter(5)
  const rt = await createRuntime(testConfig(opts.cfg), { store, inference, fetchImpl: opts.fetchImpl })
  return { rt, store, inference }
}

/** Wraps the mock adapter and overrides the content for one purpose (e.g. to return invalid JSON). */
export class ScriptedInference implements InferenceAdapter {
  readonly mode = "mock" as const
  readonly model = "scripted"
  private readonly inner = new MockInferenceAdapter(5)
  constructor(private readonly override: Partial<Record<InferenceRequest["purpose"], string>>) {}
  async complete(req: InferenceRequest): Promise<InferenceResponse> {
    const res = await this.inner.complete(req)
    const content = this.override[req.purpose]
    return content === undefined ? res : { ...res, content }
  }
  status() {
    return this.inner.status()
  }
}
