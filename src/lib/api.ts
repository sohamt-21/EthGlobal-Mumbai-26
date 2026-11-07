import type {
  Agent,
  ApiResponse,
  ExecuteWorkflowInput,
  ExplorerEntity,
  EntityKind,
  Identity,
  IdentityEvent,
  InferenceMetadata,
  IntegrationStatus,
  RuntimeStats,
  AgentTrustReport,
  Workflow,
} from "../../shared/schemas"

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? ""

const TOKEN_KEY = "voxmesh.session"
export const sessionToken = {
  get: () => localStorage.getItem(TOKEN_KEY) ?? undefined,
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = sessionToken.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } })
  } catch {
    throw new ApiError("NETWORK", "VoxMesh API is unreachable. Is the server running (npm run dev)?", 0)
  }
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null
  if (!body) throw new ApiError("BAD_RESPONSE", `Unexpected response (${res.status})`, res.status)
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, res.status)
  return body.data
}

export type AgentView = Agent & { entityKey: string | null; stats: { completed: number; failed: number }; activity: { at: string; text: string }[] }
export type Sample = { id: string; name: string; description: string; source: string }
export type IdentityConfig = {
  mode: "live" | "dev-bypass" | "disabled"
  appId: string | null
  rpId: string | null
  action: string
  environment: "production" | "staging" | "sandbox"
  devBypassEnabled: boolean
  workflowRequiresHuman: boolean
}
export type RpContext = { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string }
export type Stored<T> = { key: string; owner: string | null; expiresAtBlock: string | null; data: T }

export const api = {
  health: () => call<{ status: string; inference: string; store: string; identity: string }>("/api/health"),
  integrations: (refresh = false) => call<IntegrationStatus[]>(`/api/integrations/status${refresh ? "?refresh=1" : ""}`),
  stats: () => call<RuntimeStats>("/api/runtime/stats"),
  agents: () => call<AgentView[]>("/api/agents"),
  agentTrust: (id: string) => call<AgentTrustReport>(`/api/agents/${encodeURIComponent(id)}/trust`),
  registerAgent: (input: { id: string; ensName?: string; endpoint?: string }) =>
    call<AgentView>("/api/agents/register", { method: "POST", body: JSON.stringify(input) }),
  samples: () => call<Sample[]>("/api/samples"),
  execute: (input: Partial<ExecuteWorkflowInput> & { command: string }) =>
    call<Workflow>("/api/orchestrator/execute", { method: "POST", body: JSON.stringify(input) }),
  workflows: () => call<Workflow[]>("/api/executions"),
  workflow: (id: string) => call<Workflow>(`/api/executions/${id}`),
  workflowArkiv: (id: string) =>
    call<{ executions: Stored<Record<string, unknown>>[]; messages: Stored<Record<string, unknown>>[]; tasks: Stored<Record<string, unknown>>[] }>(`/api/executions/${id}/arkiv`),
  inference: () => call<InferenceMetadata[]>("/api/inference/recent"),
  explore: (kind: EntityKind, limit = 30) => call<{ mode: string; owner: string | null; entities: ExplorerEntity[] }>(`/api/arkiv/explore?kind=${kind}&limit=${limit}`),
  identityConfig: () => call<IdentityConfig>("/api/identity/config"),
  identityStatus: () => call<{ identity: Identity | null; mode: string }>("/api/identity/status"),
  identityEvents: () => call<IdentityEvent[]>("/api/identity/events"),
  rpContext: () => call<RpContext>("/api/identity/rp-context", { method: "POST" }),
  verify: (result: unknown) => call<{ token: string; identity: Identity }>("/api/identity/verify", { method: "POST", body: JSON.stringify(result) }),
  devBypass: () => call<{ token: string; identity: Identity }>("/api/identity/dev-bypass", { method: "POST" }),
  logout: () => call<{ revoked: boolean }>("/api/identity/logout", { method: "POST" }),
}
