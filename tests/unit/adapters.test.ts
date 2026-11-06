import { describe, expect, it } from "vitest"
import { IdentityService } from "../../server/adapters/identity/service"
import { ZeroGInferenceAdapter } from "../../server/adapters/inference/zerog"
import { MemoryCoordinationStore } from "../../server/adapters/store/memory"
import { testConfig } from "../../server/config"
import { isTransient } from "../../server/lib/errors"
import type { Task } from "../../shared/schemas"

/* ───────────── 0G adapter (mocked HTTP — proves parsing, NOT live connectivity) ───────────── */

function zgFetch(status: number, body: unknown, seen?: { url?: string; init?: RequestInit }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (seen) Object.assign(seen, { url: String(url), init })
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as typeof fetch
}

const zgOpts = { apiKey: "sk-test", baseUrl: "https://router-api.0g.ai/v1", model: "glm-5.2", verifyTee: true, disableThinking: true, timeoutMs: 5000, trustMode: "private" }

describe("ZeroGInferenceAdapter", () => {
  it("captures x_0g_trace request id, provider, billing and TEE flag", async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const adapter = new ZeroGInferenceAdapter({
      ...zgOpts,
      fetchImpl: zgFetch(
        200,
        {
          id: "chatcmpl-1",
          model: "glm-5.2",
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          x_0g_trace: { request_id: "0852f405-6c56", provider: "0xd996", billing: { input_cost: "1", output_cost: "2", total_cost: "3" }, tee_verified: true },
        },
        seen,
      ),
    })
    const res = await adapter.complete({ agentId: "research", purpose: "research", messages: [{ role: "user", content: "hi" }] })
    expect(res.metadata).toMatchObject({ provider: "0g", requestId: "0852f405-6c56", providerAddress: "0xd996", teeVerified: true, trustMode: "private" })
    expect(res.metadata.billing?.totalCost).toBe("3")
    expect(seen.url).toBe("https://router-api.0g.ai/v1/chat/completions")
    const headers = seen.init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer sk-test")
    expect(headers["X-0G-Provider-Trust-Mode"]).toBe("private")
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ verify_tee: true, chat_template_kwargs: { enable_thinking: false } })
  })

  it("refuses responses without an 0G trace id instead of fabricating one", async () => {
    const adapter = new ZeroGInferenceAdapter({ ...zgOpts, fetchImpl: zgFetch(200, { choices: [{ message: { content: "x" } }] }) })
    await expect(adapter.complete({ agentId: "a", purpose: "plan", messages: [] })).rejects.toMatchObject({ code: "INFERENCE_NO_TRACE" })
  })

  it("marks 429/5xx as retryable and 4xx as permanent", async () => {
    const e429 = await new ZeroGInferenceAdapter({ ...zgOpts, fetchImpl: zgFetch(429, { error: "slow down" }) })
      .complete({ agentId: "a", purpose: "plan", messages: [] })
      .catch((e) => e)
    expect(isTransient(e429)).toBe(true)
    const e401 = await new ZeroGInferenceAdapter({ ...zgOpts, fetchImpl: zgFetch(401, { error: "bad key" }) })
      .complete({ agentId: "a", purpose: "plan", messages: [] })
      .catch((e) => e)
    expect(isTransient(e401)).toBe(false)
  })
})

/* ───────────── coordination store semantics ───────────── */

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  workflowId: "wf_1",
  type: "research",
  description: "d",
  requiredCapability: "contract_research",
  createdBy: "supervisor",
  assignedAgent: null,
  claimedBy: null,
  status: "open",
  priority: 5,
  dependsOn: [],
  input: {},
  resultEntityKey: null,
  createdAt: "",
  updatedAt: "",
  expiresAt: "",
  ...over,
})

describe("MemoryCoordinationStore", () => {
  it("registers and discovers agents idempotently", async () => {
    const s = new MemoryCoordinationStore()
    const rec = { agentId: "research", name: "R", description: "", capabilities: ["contract_research"], endpoint: "", ensName: null, owner: "x", status: "idle" as const, registeredAt: "" }
    await s.upsertAgents([rec])
    await s.upsertAgents([rec])
    expect(await s.listAgents()).toHaveLength(1)
  })

  it("creates, queries, claims once and completes tasks", async () => {
    const s = new MemoryCoordinationStore()
    const { taskKeys } = await s.createTasks([task("t1"), task("t2", { requiredCapability: "security_review", type: "security_review" })], [])
    expect(await s.queryTasks({ status: "open", capability: "contract_research" })).toHaveLength(1)
    await s.claimTask(taskKeys.t1, "research", null)
    await expect(s.claimTask(taskKeys.t1, "security", null)).rejects.toMatchObject({ code: "CONFLICT" })
    const done = await s.completeTask(
      taskKeys.t1,
      { id: "e1", workflowId: "wf_1", taskId: "t1", agentId: "research", status: "success", inferenceRequestIds: ["r1"], inferenceProvider: "mock", durationMs: 1, output: { a: 1 }, createdAt: "" },
      null,
    )
    const t1 = await s.getTask(taskKeys.t1)
    expect(t1?.data).toMatchObject({ status: "completed", resultEntityKey: done.resultKey, claimedBy: "research" })
    expect((await s.getExecution(done.resultKey))?.data.output).toEqual({ a: 1 })
    expect(await s.listExecutions({ workflowId: "wf_1" })).toHaveLength(1)
  })
})

/* ───────────── World ID verification (mocked World API) ───────────── */

const SIGNING_KEY = "0x" + "11".repeat(32)
const worldCfg = () =>
  testConfig({ WORLD_APP_ID: "app_test", WORLD_RP_ID: "rp_test", WORLD_RP_SIGNING_KEY: SIGNING_KEY, WORLD_ACTION: "authorize-voxmesh-agents" })

const proof = (nonce: string) => ({
  protocol_version: "4.0",
  nonce,
  action: "authorize-voxmesh-agents",
  environment: "production",
  responses: [{ identifier: "proof_of_human", nullifier: "12345", proof: ["1", "2", "3", "4", "5"], issuer_schema_id: 1, expires_at_min: 0 }],
})

describe("IdentityService", () => {
  it("is disabled without credentials and refuses the dev bypass by default", async () => {
    const id = new IdentityService(testConfig(), new MemoryCoordinationStore())
    expect(id.mode).toBe("disabled")
    await expect(id.devBypass()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(() => id.require(undefined, "agent:register")).toThrow(/verified human/)
  })

  it("labels dev-bypass sessions so they cannot be mistaken for World ID", async () => {
    const id = new IdentityService(testConfig({ WORLD_ID_DEV_BYPASS: "true" }), new MemoryCoordinationStore())
    const s = await id.devBypass()
    expect(s.identity.verificationProvider).toBe("dev-bypass")
  })

  it("signs rp_context, forwards the proof unchanged to World, and opens a session on success", async () => {
    let forwarded: unknown = null
    let url = ""
    const fetchImpl = (async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u)
      forwarded = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as typeof fetch
    const store = new MemoryCoordinationStore()
    const id = new IdentityService(worldCfg(), store, fetchImpl)
    const rp = id.rpContext()
    expect(rp).toMatchObject({ rp_id: "rp_test" })
    expect(rp.signature).toMatch(/^0x/)
    const p = proof(rp.nonce)
    const s = await id.verifyWorldId(p)
    expect(url).toBe("https://developer.worldcoin.org/api/v4/verify/rp_test")
    expect(forwarded).toEqual(p)
    expect(s.identity).toMatchObject({ verificationProvider: "world-id", verificationStatus: "verified" })
    expect(s.identity.subject).not.toContain("12345") // hashed nullifier only
    expect(id.require(s.token, "agent:register").subject).toBe(s.identity.subject)
    expect(s.identity.arkivEntityKey).toMatch(/^local:identity/)
  })

  it("rejects replayed nonces, unknown nonces and World rejections", async () => {
    const ok = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch
    const id = new IdentityService(worldCfg(), new MemoryCoordinationStore(), ok)
    await expect(id.verifyWorldId(proof("not-issued"))).rejects.toMatchObject({ code: "INVALID_NONCE" })
    const rp = id.rpContext()
    await id.verifyWorldId(proof(rp.nonce))
    await expect(id.verifyWorldId(proof(rp.nonce))).rejects.toMatchObject({ code: "INVALID_NONCE" })

    const reject = (async () => new Response(JSON.stringify({ success: false, code: "invalid_proof" }), { status: 400 })) as unknown as typeof fetch
    const id2 = new IdentityService(worldCfg(), new MemoryCoordinationStore(), reject)
    await expect(id2.verifyWorldId(proof(id2.rpContext().nonce))).rejects.toMatchObject({ code: "VERIFICATION_REJECTED" })
    await expect(id2.verifyWorldId({ nonsense: true })).rejects.toMatchObject({ code: "INVALID_PROOF" })
  })

  it("expires sessions", async () => {
    const id = new IdentityService(testConfig({ WORLD_ID_DEV_BYPASS: "true", IDENTITY_SESSION_TTL_MINUTES: "1" }), new MemoryCoordinationStore())
    const s = await id.devBypass()
    s.identity.expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(id.session(s.token)).toBeNull()
    expect(id.events()[0].type).toBe("session.expired")
  })
})
