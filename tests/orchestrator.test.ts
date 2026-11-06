import { describe, expect, it } from "vitest"
import { MockInferenceAdapter } from "../server/adapters/inference/mock"
import { AppError } from "../server/lib/errors"
import { FULL_DEMO_COMMAND, makeRuntime, ScriptedInference } from "./helpers"

const initiator = { subject: "test", verified: false, provider: "none" }

describe("orchestrator", () => {
  it("runs research → security sequentially, with security reading research output from the store", async () => {
    const { rt, store } = await makeRuntime()
    const wf = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, initiator)

    expect(wf.status).toBe("completed")
    expect(wf.tasks.map((t) => [t.type, t.status])).toEqual([
      ["research", "completed"],
      ["security_review", "completed"],
    ])
    const actions = wf.trace.map((t) => `${t.agentId}:${t.action}`)
    const researchDone = actions.indexOf("research:task.completed")
    const securityStart = actions.indexOf("security:task.started")
    expect(researchDone).toBeGreaterThan(-1)
    expect(securityStart).toBeGreaterThan(researchDone)
    // Security loaded the research execution record from the coordination store
    const depRead = wf.trace.find((t) => t.agentId === "security" && t.action === "arkiv.read" && /dependency/.test(t.detail))
    const researchTask = wf.tasks.find((t) => t.type === "research")!
    expect(depRead?.arkivEntityId).toBe(researchTask.resultEntityKey)
    // Store state reflects both tasks as completed with result entities
    const stored = await store.queryTasks({ workflowId: wf.id })
    expect(stored.every((t) => t.data.status === "completed" && t.data.resultEntityKey)).toBe(true)
    expect(await store.listExecutions({ workflowId: wf.id })).toHaveLength(2)
    // Inference metadata captured per call and linked from the trace
    expect(wf.inference.length).toBe(4)
    expect(wf.trace.filter((t) => t.inferenceRequestId).length).toBeGreaterThanOrEqual(4)
    expect(wf.finalReport?.overallRisk).toBe("critical")
    expect(wf.finalReport?.disclaimer).toMatch(/Not a formal audit/)
    expect(wf.arkivRecordKey).toMatch(/^local:workflow/)
    // Supervisor-worker messages only
    expect(wf.messages.every((m) => m.senderAgentId === "supervisor" || m.receiverAgentId === "supervisor")).toBe(true)
  })

  it("only invokes the agents the request needs", async () => {
    const { rt } = await makeRuntime()
    const wf = await rt.orchestrator.execute({ command: "Explain what this contract does", sampleContractId: "mesh-token", channel: "voice" }, initiator)
    expect(wf.tasks.map((t) => t.assignedAgent)).toEqual(["research"])
    expect(wf.trace.some((t) => t.agentId === "security")).toBe(false)
  })

  it("answers general questions without delegation", async () => {
    const { rt } = await makeRuntime()
    const wf = await rt.orchestrator.execute({ command: "Hi, what can you do?", channel: "text" }, initiator)
    expect(wf.status).toBe("completed")
    expect(wf.tasks).toHaveLength(0)
    expect(wf.finalReport?.markdown).toMatch(/Research Agent/)
  })

  it("routes Sepolia ETH sends only to the MetaMask agent and fails closed when it is not configured", async () => {
    const { rt } = await makeRuntime()
    const wf = await rt.orchestrator.execute(
      { command: "Send 0.001 Sepolia ETH to 0x000000000000000000000000000000000000dEaD", channel: "text" },
      initiator,
    )

    expect(wf.plan?.intent).toBe("wallet_transfer")
    expect(wf.tasks.map((task) => [task.type, task.assignedAgent, task.status])).toEqual([[
      "wallet_transfer",
      "metamask",
      "failed",
    ]])
    expect(wf.inference).toHaveLength(0)
    expect(wf.finalReport?.markdown).toMatch(/No transaction was submitted/)
    expect(wf.results[wf.tasks[0].id]?.error?.code).toBe("METAMASK_NOT_CONFIGURED")
  })

  it("asks for missing transfer details without creating a wallet task", async () => {
    const { rt } = await makeRuntime()
    const wf = await rt.orchestrator.execute({ command: "Send 0.001 ETH to a specific address", channel: "text" }, initiator)

    expect(wf.status).toBe("completed")
    expect(wf.plan?.intent).toBe("general_question")
    expect(wf.tasks).toHaveLength(0)
    expect(wf.finalReport?.markdown).toMatch(/Sepolia network.*recipient address/)
  })

  it("runs Polymarket public research and a persisted dry-run LP plan end to end", async () => {
    const query = "Another S&P 500 Company buys Bitcoin by December 31, 2026"
    let requestedUrl = ""
    const fetchImpl = (async (input: string | URL | Request) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({
        events: [{
          title: "Another S&P 500 Company buys Bitcoin by...?",
          markets: [{
            id: "market-42",
            question: query,
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
      }), { status: 200, headers: { "content-type": "application/json" } })
    }) as typeof fetch
    const { rt, store } = await makeRuntime({ fetchImpl })
    const wf = await rt.orchestrator.execute(
      { command: `Simulate a Polymarket liquidity plan for "${query}"`, channel: "text" },
      initiator,
    )

    expect(wf.status).toBe("completed")
    expect(wf.plan?.intent).toBe("prediction_market_simulation")
    expect(wf.tasks.map((task) => [task.type, task.assignedAgent, task.status])).toEqual([
      ["market_research", "research", "completed"],
      ["liquidity_simulation", "liquidity", "completed"],
    ])
    expect(new URL(requestedUrl).pathname).toBe("/public-search")
    expect(new URL(requestedUrl).searchParams.get("q")).toBe(query)
    expect(wf.inference).toHaveLength(0)
    expect(wf.tasks.some((task) => task.type === "wallet_transfer")).toBe(false)
    const simulation = Object.values(wf.results).find((result) => result.agentId === "liquidity")!
    expect(simulation.result).toMatchObject({ simulationOnly: true, totalQuoteNotionalCapUsd: 20 })
    expect((simulation.result.quotes as unknown[])).toHaveLength(4)
    expect(wf.finalReport?.markdown).toMatch(/Simulation only|no orders were submitted/i)
    expect(wf.trace.every((trace) => trace.txHash === null)).toBe(true)
    expect(await store.listExecutions({ workflowId: wf.id })).toHaveLength(2)
  })

  it("runs independent tasks in parallel", async () => {
    const { rt } = await makeRuntime({ inference: new MockInferenceAdapter(150) })
    const wf = await rt.orchestrator.execute({ command: "Run research and security review in parallel on this contract", sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(wf.status).toBe("completed")
    const startedAt = wf.trace.filter((t) => t.action === "task.started").map((t) => Date.parse(t.timestamp))
    const firstDone = Math.min(...wf.trace.filter((t) => t.action === "task.completed").map((t) => Date.parse(t.timestamp)))
    expect(startedAt).toHaveLength(2)
    expect(Math.max(...startedAt)).toBeLessThanOrEqual(firstDone)
  })

  it("retries transient inference failures", async () => {
    const flaky = new MockInferenceAdapter(5, (req, n) => (req.purpose === "research" && n <= 2 ? new AppError("INFERENCE_FAILED", "503 upstream", 502, undefined, true) : null))
    const { rt } = await makeRuntime({ inference: flaky })
    const wf = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(wf.status).toBe("completed")
    expect(wf.trace.some((t) => t.action === "task.retry" && t.agentId === "research")).toBe(true)
    expect(Object.values(wf.results).find((r) => r.agentId === "research")?.attempts).toBe(2)
  })

  it("recovers from a failed agent: dependents are skipped and the workflow is marked failed/partial", async () => {
    const broken = new MockInferenceAdapter(5, (req) => (req.purpose === "research" ? new AppError("INFERENCE_FAILED", "bad request", 400) : null))
    const { rt, store } = await makeRuntime({ inference: broken })
    const seq = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(seq.tasks.map((t) => t.status)).toEqual(["failed", "cancelled"])
    expect(seq.status).toBe("failed")
    expect(seq.finalReport).not.toBeNull()
    const stored = await store.queryTasks({ workflowId: seq.id })
    expect(stored.map((t) => t.data.status).sort()).toEqual(["cancelled", "failed"])

    const par = await rt.orchestrator.execute({ command: "research and security review in parallel", sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(par.status).toBe("partial")
    expect(par.finalReport?.markdown).toMatch(/Incomplete/)
  })

  it("falls back to the deterministic planner when the model returns an invalid plan", async () => {
    const { rt } = await makeRuntime({ inference: new ScriptedInference({ plan: "I think you should do some research!" }) })
    const wf = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(wf.trace.some((t) => t.action === "plan.fallback")).toBe(true)
    expect(wf.status).toBe("completed")
  })

  it("rejects a model plan that tries to delegate aggregation, and validates agent outputs", async () => {
    const badPlan = JSON.stringify({ intent: "full_audit", reasoning: "x", steps: [{ id: "agg", type: "aggregate", capability: "aggregation", description: "do it", dependsOn: [] }], directAnswer: null })
    const { rt } = await makeRuntime({ inference: new ScriptedInference({ plan: badPlan, security: '{"overallRisk":"none"}' }) })
    const wf = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(wf.trace.find((t) => t.action === "plan.fallback")?.detail).toMatch(/aggregation|Aggregation|capability/)
    const sec = Object.values(wf.results).find((r) => r.agentId === "security")!
    expect(sec.result.llmFallback).toBe(true) // invalid model output never reaches the report unvalidated
    expect(sec.inference).toHaveLength(2) // original + repair round
  })

  it("enforces the per-workflow agent call budget", async () => {
    const flaky = new MockInferenceAdapter(5, (req) => (req.purpose === "research" ? new AppError("X", "503", 502, undefined, true) : null))
    const { rt } = await makeRuntime({ inference: flaky, cfg: { MAX_AGENT_CALLS_PER_WORKFLOW: "3", AGENT_MAX_RETRIES: "5" } })
    const wf = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, initiator)
    expect(wf.agentCalls).toBeLessThanOrEqual(3)
    expect(wf.trace.some((t) => /exceeded 3 agent calls/.test(t.detail))).toBe(true)
  })

  it("extracts inline Solidity pasted into the command", async () => {
    const { rt } = await makeRuntime()
    const wf = await rt.orchestrator.execute(
      { command: "Review the security of this: pragma solidity ^0.8.0; contract X { function f() external { selfdestruct(payable(msg.sender)); } }", channel: "text" },
      initiator,
    )
    expect(wf.command).toMatch(/\[inline contract source\]/)
    expect(wf.finalReport?.overallRisk).toBe("critical")
  })
})
