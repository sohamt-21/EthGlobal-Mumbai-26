import { describe, expect, it } from "vitest"
import { assessAgentTrust } from "../../server/runtime/trust"

describe("AgentRank trust assessment", () => {
  it("keeps missing chain evidence in review instead of claiming trust", () => {
    const report = assessAgentTrust({
      agentId: "research",
      status: "idle",
      registered: true,
      ensName: null,
      ownerVerified: false,
      completedTasks: 0,
      failedTasks: 0,
    }, "2026-11-07T00:00:00.000Z")

    expect(report.decision).toBe("review_before_call")
    expect(report.identity).toMatchObject({ erc8004AgentId: null, erc8004Registered: null, agentKitHumanBacked: null })
    expect(report.transactability).toEqual({ x402Supported: null, status: "unknown" })
    expect(report.evidence.independentRaters).toBeNull()
    expect(report.riskFlags).toContain("ERC-8004 feedback quality and BigQuery Sybil analytics are unavailable")
  })

  it("rejects offline agents and agents with persistently poor outcomes", () => {
    const offline = assessAgentTrust({
      agentId: "security",
      status: "offline",
      registered: true,
      ensName: "security.voxmesh.eth",
      ownerVerified: true,
      completedTasks: 0,
      failedTasks: 0,
    })
    const failing = assessAgentTrust({
      agentId: "security",
      status: "idle",
      registered: true,
      ensName: null,
      ownerVerified: false,
      completedTasks: 1,
      failedTasks: 4,
    })

    expect(offline.decision).toBe("do_not_call")
    expect(failing.decision).toBe("do_not_call")
    expect(failing.axes.reputationQuality.score).toBe(5)
  })
})