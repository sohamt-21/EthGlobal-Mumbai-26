/**
 * LIVE integration tests — hit real 0G and Arkiv. Skipped unless credentials are configured.
 *   npm run test:integration
 * These are the only tests that prove external connectivity; unit tests use mocks.
 */
import { describe, expect, it } from "vitest"
import { ArkivCoordinationStore } from "../../server/adapters/store/arkiv"
import { loadConfig } from "../../server/config"
import { selectInference } from "../../server/runtime/container"
import { createRuntime } from "../../server/runtime/container"
import { FULL_DEMO_COMMAND } from "../helpers"

const cfg = loadConfig()

describe.skipIf(!cfg.ZG_API_KEY)("0G live inference", () => {
  it("returns content and an x_0g_trace request id", async () => {
    const inf = selectInference({ ...cfg, INFERENCE_MODE: "zerog" })
    const res = await inf.complete({ agentId: "supervisor", purpose: "plan", messages: [{ role: "user", content: 'Reply with {"pong":true}' }] })
    expect(res.metadata.provider).toBe("0g")
    expect(res.metadata.requestId).not.toMatch(/^mock_/)
    console.log("0G metadata", res.metadata)
  }, 90_000)
})

describe.skipIf(!cfg.ARKIV_PRIVATE_KEY)("Arkiv live persistence", () => {
  it("creates, queries, claims and reads back a task entity", async () => {
    const store = new ArkivCoordinationStore({ privateKey: cfg.ARKIV_PRIVATE_KEY!, accessKey: cfg.ARKIV_ACCESS_KEY, workspace: `${cfg.ARKIV_WORKSPACE}-it`, taskTtlHours: 1, agentTtlDays: 1 })
    const now = new Date().toISOString()
    const id = `task_it_${Date.now()}`
    const created = await store.createTasks(
      [{ id, workflowId: `wf_it_${Date.now()}`, type: "research", description: "integration", requiredCapability: "contract_research", createdBy: "test", assignedAgent: null, claimedBy: null, status: "open", priority: 1, dependsOn: [], input: {}, resultEntityKey: null, createdAt: now, updatedAt: now, expiresAt: now }],
      [],
    )
    expect(created.txHash).toMatch(/^0x/)
    const key = created.taskKeys[id]
    const claim = await store.claimTask(key, "research", null)
    expect(claim.txHash).toMatch(/^0x/)
    expect((await store.getTask(key))?.data).toMatchObject({ status: "claimed", claimedBy: "research" })
  }, 120_000)
})

describe.skipIf(!cfg.ZG_API_KEY || !cfg.ARKIV_PRIVATE_KEY)("Full live workflow", () => {
  it("runs the demo workflow on 0G + Arkiv", async () => {
    const rt = await createRuntime(cfg)
    const wf = await rt.orchestrator.execute({ command: FULL_DEMO_COMMAND, sampleContractId: "mesh-vault", channel: "text" }, { subject: "it", verified: false, provider: "none" })
    expect(wf.status).toBe("completed")
    expect(wf.inference.every((i) => i.provider === "0g")).toBe(true)
    expect(wf.tasks.every((t) => t.arkivEntityKey?.startsWith("0x"))).toBe(true)
    console.log("workflow", wf.id, wf.arkivRecordKey)
  }, 300_000)
})
