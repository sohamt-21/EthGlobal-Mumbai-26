import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../server/api/app"
import type { AppConfig } from "../server/config"
import { FULL_DEMO_COMMAND, makeRuntime } from "./helpers"

async function app(cfg: Partial<Record<keyof AppConfig, string>> = {}, fetchImpl?: typeof fetch) {
  const { rt, store } = await makeRuntime({ cfg, fetchImpl })
  return { http: createApp(rt), rt, store }
}

describe("API", () => {
  it("reports health and labelled integration modes", async () => {
    const { http } = await app()
    const health = await request(http).get("/api/health")
    expect(health.body).toMatchObject({ ok: true, data: { inference: "mock", store: "memory", identity: "disabled" } })
    const status = await request(http).get("/api/integrations/status")
    const modes = Object.fromEntries(status.body.data.map((s: { name: string; mode: string }) => [s.name, s.mode]))
    expect(modes).toMatchObject({ "0G Inference": "mock", Arkiv: "memory", "World ID": "disabled", "Hedera x402": "disabled" })
  })

  it("lists the registered agents with their store entity keys", async () => {
    const { http } = await app()
    const res = await request(http).get("/api/agents")
    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual(["supervisor", "research", "security", "metamask", "liquidity"])
    expect(res.body.data.every((a: { entityKey: string }) => a.entityKey.startsWith("local:agent"))).toBe(true)
  })

  it("validates input with a consistent error envelope", async () => {
    const { http } = await app()
    const res = await request(http).post("/api/orchestrator/execute").send({ command: "" })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } })
    const bad = await request(http).post("/api/orchestrator/execute").set("content-type", "application/json").send("{oops")
    expect(bad.body.error.code).toBe("INVALID_JSON")
    expect((await request(http).get("/api/nope")).status).toBe(404)
  })

  it("protects agent registration behind a verified human", async () => {
    const { http } = await app({ WORLD_ID_DEV_BYPASS: "true" })
    const denied = await request(http).post("/api/agents/register").send({ id: "research", ensName: "research.voxmesh.eth" })
    expect(denied.status).toBe(401)
    const session = await request(http).post("/api/identity/dev-bypass")
    expect(session.body.data.identity.verificationProvider).toBe("dev-bypass")
    const token = session.body.data.token
    const ok = await request(http).post("/api/agents/register").set("authorization", `Bearer ${token}`).send({ id: "research", ensName: "research.voxmesh.eth" })
    expect(ok.status).toBe(201)
    expect(ok.body.data.identity.humanVerified).toBe(true)
    expect(ok.body.data.owner).toBe(session.body.data.identity.subject)
    // a different human cannot take over the agent
    const other = await request(http).post("/api/identity/dev-bypass")
    const takeover = await request(http).post("/api/agents/register").set("authorization", `Bearer ${other.body.data.token}`).send({ id: "research" })
    expect(takeover.status).toBe(403)
  })

  it("requires a verified human for workflows when WORKFLOW_REQUIRES_HUMAN=true", async () => {
    const { http } = await app({ WORKFLOW_REQUIRES_HUMAN: "true" })
    const res = await request(http).post("/api/orchestrator/execute").send({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault" })
    expect(res.status).toBe(401)
  })

  it("lets an external worker create, claim and complete a task with ownership checks", async () => {
    const { http } = await app()
    const key = { "x-agent-key": "test-agent-key" }
    expect((await request(http).post("/api/tasks").send({ type: "research", description: "look", requiredCapability: "contract_research" })).status).toBe(401)
    const created = await request(http).post("/api/tasks").set(key).send({ type: "research", description: "look at it", requiredCapability: "contract_research" })
    expect(created.status).toBe(201)
    const entityKey = created.body.data.entityKey
    const open = await request(http).get("/api/tasks").query({ status: "open", capability: "contract_research" })
    expect(open.body.data.map((t: { key: string }) => t.key)).toContain(entityKey)
    expect((await request(http).post(`/api/tasks/${entityKey}/claim`).set(key).send({ agentId: "security" })).status).toBe(403) // wrong capability
    expect((await request(http).post(`/api/tasks/${entityKey}/claim`).set(key).send({ agentId: "research" })).status).toBe(200)
    expect((await request(http).post(`/api/tasks/${entityKey}/claim`).set(key).send({ agentId: "research" })).status).toBe(409)
    expect((await request(http).post(`/api/tasks/${entityKey}/complete`).set(key).send({ agentId: "security", status: "completed", output: {} })).status).toBe(403)
    const done = await request(http).post(`/api/tasks/${entityKey}/complete`).set(key).send({ agentId: "research", status: "completed", output: { note: "ok" } })
    expect(done.status).toBe(200)
    expect((await request(http).get(`/api/tasks/${entityKey}`)).body.data.data.status).toBe("completed")
  })

  it("E2E: full research + security workflow through the API, visible in trace and store", async () => {
    const { http } = await app()
    const res = await request(http).post("/api/orchestrator/execute?wait=true").send({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-token", channel: "voice" })
    expect(res.status).toBe(201)
    const wf = res.body.data
    expect(wf.status).toBe("completed")
    expect(wf.plan.intent).toBe("full_audit")
    expect(wf.tasks.every((t: { input: Record<string, unknown> }) => t.input.source === undefined && typeof t.input.sourceBytes === "number")).toBe(true)

    const trace = (await request(http).get(`/api/executions/${wf.id}/trace`)).body.data
    expect(trace.filter((t: { inferenceRequestId: string | null }) => t.inferenceRequestId?.startsWith("mock_")).length).toBeGreaterThanOrEqual(4)
    expect(trace.some((t: { action: string; arkivEntityId: string | null }) => t.action === "task.claimed" && t.arkivEntityId)).toBe(true)

    const persisted = (await request(http).get(`/api/executions/${wf.id}/arkiv`)).body.data
    expect(persisted.executions).toHaveLength(2)
    expect(persisted.tasks.every((t: { data: { status: string } }) => t.data.status === "completed")).toBe(true)
    expect(persisted.messages.map((m: { data: { messageType: string } }) => m.data.messageType).sort()).toEqual(
      ["task.claimed", "task.claimed", "task.delegate", "task.delegate", "task.result", "task.result"],
    )

    const explorer = (await request(http).get("/api/arkiv/explore").query({ kind: "task" })).body.data
    expect(explorer.mode).toBe("memory")
    expect(explorer.entities.length).toBe(2)

    const stats = (await request(http).get("/api/runtime/stats")).body.data
    expect(stats).toMatchObject({ agents: 5, completedTasks: 2, failedTasks: 0, inferenceCalls: 4 })
  })

  it("E2E: Polymarket research and LP quotes run through the API without placing orders", async () => {
    const question = "Another S&P 500 Company buys Bitcoin by December 31, 2026"
    const fetchImpl = (async () => new Response(JSON.stringify({
      events: [{
        title: "Another S&P 500 Company buys Bitcoin by...?",
        markets: [{
          id: "market-42",
          question,
          slug: "another-sp500-company-buys-bitcoin-by-december-31-2026",
          resolutionSource: "https://www.sec.gov/",
          endDate: "2026-12-31T23:59:00Z",
          active: true,
          closed: false,
          acceptingOrders: true,
          outcomes: '["Yes", "No"]',
          outcomePrices: '["0.0855", "0.9145"]',
          bestBid: 0.07,
          bestAsk: 0.09,
          liquidityNum: 1200,
          volume24hr: 8500,
        }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    const { http, store } = await app({}, fetchImpl)
    const response = await request(http).post("/api/orchestrator/execute?wait=true").send({
      command: `Simulate a Polymarket liquidity plan for "${question}"`,
      channel: "text",
    })

    expect(response.status).toBe(201)
    const workflow = response.body.data
    expect(workflow.status).toBe("completed")
    expect(workflow.plan.intent).toBe("prediction_market_simulation")
    expect(workflow.tasks.map((task: { type: string; status: string }) => [task.type, task.status])).toEqual([
      ["market_research", "completed"],
      ["liquidity_simulation", "completed"],
    ])
    expect(workflow.finalReport.markdown).toMatch(/Simulation only/)
    expect(workflow.finalReport.markdown).toMatch(/No Polymarket orders/)
    expect(workflow.tasks.some((task: { type: string }) => task.type === "wallet_transfer")).toBe(false)
    expect(await store.listExecutions({ workflowId: workflow.id })).toHaveLength(2)
  })
})
