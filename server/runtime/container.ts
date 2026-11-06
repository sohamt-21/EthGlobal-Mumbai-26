import { IdentityService } from "../adapters/identity/service"
import { MockInferenceAdapter } from "../adapters/inference/mock"
import type { InferenceAdapter } from "../adapters/inference/types"
import { ZeroGInferenceAdapter } from "../adapters/inference/zerog"
import { ArkivCoordinationStore } from "../adapters/store/arkiv"
import { MemoryCoordinationStore } from "../adapters/store/memory"
import type { CoordinationStore } from "../adapters/store/types"
import { ResearchAgent } from "../agents/research"
import { SecurityAgent } from "../agents/security"
import { SupervisorAgent } from "../agents/supervisor"
import type { AppConfig } from "../config"
import { AppError } from "../lib/errors"
import { AGENT_TOOL_ALLOWLIST, ToolRegistry } from "../tools/registry"
import { AgentMessageBus } from "./bus"
import { Orchestrator } from "./orchestrator"
import { AgentRegistry } from "./registry"

export type Runtime = Awaited<ReturnType<typeof createRuntime>>

export function selectInference(cfg: AppConfig, fetchImpl?: typeof fetch): InferenceAdapter {
  const wantLive = cfg.INFERENCE_MODE === "zerog" || (cfg.INFERENCE_MODE === "auto" && cfg.ZG_API_KEY)
  if (!wantLive) return new MockInferenceAdapter()
  if (!cfg.ZG_API_KEY) throw new AppError("CONFIG", "INFERENCE_MODE=zerog requires ZG_API_KEY", 500)
  return new ZeroGInferenceAdapter({
    apiKey: cfg.ZG_API_KEY,
    baseUrl: cfg.ZG_BASE_URL,
    model: cfg.ZG_MODEL,
    trustMode: cfg.ZG_TRUST_MODE,
    verifyTee: cfg.ZG_VERIFY_TEE,
    disableThinking: cfg.ZG_DISABLE_THINKING,
    timeoutMs: cfg.ZG_TIMEOUT_MS,
    fetchImpl,
  })
}

export function selectStore(cfg: AppConfig): CoordinationStore {
  const wantLive = cfg.ARKIV_MODE === "arkiv" || (cfg.ARKIV_MODE === "auto" && cfg.ARKIV_PRIVATE_KEY)
  if (!wantLive) return new MemoryCoordinationStore()
  if (!cfg.ARKIV_PRIVATE_KEY) throw new AppError("CONFIG", "ARKIV_MODE=arkiv requires ARKIV_PRIVATE_KEY", 500)
  return new ArkivCoordinationStore({
    privateKey: cfg.ARKIV_PRIVATE_KEY,
    accessKey: cfg.ARKIV_ACCESS_KEY,
    workspace: cfg.ARKIV_WORKSPACE,
    taskTtlHours: cfg.ARKIV_TASK_TTL_HOURS,
    agentTtlDays: cfg.ARKIV_AGENT_TTL_DAYS,
  })
}

export async function createRuntime(
  cfg: AppConfig,
  overrides: { inference?: InferenceAdapter; store?: CoordinationStore; fetchImpl?: typeof fetch } = {},
) {
  const store = overrides.store ?? selectStore(cfg)
  const inference = overrides.inference ?? selectInference(cfg, overrides.fetchImpl)
  await store.init()
  const supervisor = new SupervisorAgent()
  const bus = new AgentMessageBus(supervisor.id)
  const tools = new ToolRegistry(AGENT_TOOL_ALLOWLIST)
  const registry = new AgentRegistry(store, [supervisor, new ResearchAgent(), new SecurityAgent()], `http://localhost:${cfg.API_PORT}`)
  await registry.bootstrap()
  const identity = new IdentityService(cfg, store, overrides.fetchImpl)
  const orchestrator = new Orchestrator({ cfg, store, inference, registry, bus, tools, supervisor })
  return { cfg, store, inference, identity, registry, bus, tools, orchestrator }
}
