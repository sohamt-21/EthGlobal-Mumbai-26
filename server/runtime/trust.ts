import type { AgentId, AgentTrustAxis, AgentTrustReport } from "../../shared/schemas"

export type AgentTrustInput = {
  agentId: AgentId
  status: "idle" | "busy" | "offline"
  registered: boolean
  ensName: string | null
  ownerVerified: boolean
  completedTasks: number
  failedTasks: number
}

const axis = (score: number, status: AgentTrustAxis["status"], ...signals: string[]): AgentTrustAxis => ({ score, status, signals })

export function assessAgentTrust(input: AgentTrustInput, assessedAt = new Date().toISOString()): AgentTrustReport {
  const totalTasks = input.completedTasks + input.failedTasks
  const registryProfile = input.registered && input.status !== "offline"
    ? axis(15, "partial", "Active in the VoxMesh runtime registry", "ERC-8004 registration is not linked or verified")
    : axis(0, input.status === "offline" ? "negative" : "unknown", input.status === "offline" ? "Agent is offline" : "No active runtime registration")

  const reputationQuality = totalTasks >= 3
    ? axis(
        Math.round((input.completedTasks / totalTasks) * 25),
        "partial",
        `${input.completedTasks} completed and ${input.failedTasks} failed runtime tasks`,
        "Runtime outcomes are not ERC-8004 feedback and have no independent-rater analysis",
      )
    : axis(0, "unknown", `Only ${totalTasks} runtime outcomes; at least 3 are needed for a performance signal`, "No ERC-8004 feedback or Sybil analysis is connected")

  const ensIdentity = input.ensName
    ? axis(25, "verified", `ENS name ${input.ensName} is recorded in the runtime registry`)
    : axis(0, "unknown", "No ENS name is linked")

  const humanAccountability = input.ownerVerified
    ? axis(13, "partial", "Owner verified with World ID", "World ID owner verification is weaker than AgentKit/AgentBook proof for the agent wallet")
    : axis(0, "unknown", "No verified human owner is linked", "AgentKit/AgentBook human backing is not connected")

  const score = registryProfile.score + reputationQuality.score + ensIdentity.score + humanAccountability.score
  const riskFlags = [
    "ERC-8004 identity and registry state are not connected",
    "ERC-8004 feedback quality and BigQuery Sybil analytics are unavailable",
    "AgentKit/AgentBook human backing is not verified",
    "x402 transactability is not configured; payment support is not inferred from trust",
  ]
  if (!input.ensName) riskFlags.push("No ENS identity is linked")
  if (!input.ownerVerified) riskFlags.push("No World ID-verified owner is linked")
  if (input.status === "offline") riskFlags.push("Agent is offline")
  if (totalTasks >= 3 && input.failedTasks > input.completedTasks) riskFlags.push("Most recorded runtime tasks have failed")

  const decision = input.status === "offline" || (totalTasks >= 3 && input.failedTasks > input.completedTasks)
    ? "do_not_call"
    : "review_before_call"

  return {
    agentId: input.agentId,
    assessedAt,
    score,
    decision,
    axes: { registryProfile, reputationQuality, ensIdentity, humanAccountability },
    identity: {
      erc8004AgentId: null,
      erc8004Registered: null,
      agentKitHumanBacked: null,
      worldIdOwnerVerified: input.ownerVerified,
    },
    transactability: { x402Supported: null, status: "unknown" },
    evidence: {
      completedTasks: input.completedTasks,
      failedTasks: input.failedTasks,
      feedbackCount: 0,
      independentRaters: null,
    },
    riskFlags,
  }
}