import { describe, expect, it } from "vitest"
import { agentTextKey, agentTransferRole, buildEnsAgentHierarchy } from "../src/lib/ensv2"

const agentIds = [{ id: "supervisor" }, { id: "research" }, { id: "security" }]

describe("ENSv2 agent hierarchy", () => {
  it("builds the namespace and supervisor/subagent tree from the user's parent name", () => {
    expect(buildEnsAgentHierarchy("alice.eth", agentIds)).toEqual({
      parentName: "alice.eth",
      namespaceName: "voxmesh.alice.eth",
      supervisorName: "supervisor.voxmesh.alice.eth",
      agentNames: {
        supervisor: "supervisor.voxmesh.alice.eth",
        research: "research.supervisor.voxmesh.alice.eth",
        security: "security.supervisor.voxmesh.alice.eth",
      },
    })
  })

  it("rejects duplicate agents and names outside ENS .eth", () => {
    expect(() => buildEnsAgentHierarchy("alice.example", agentIds)).toThrow(/\.eth/)
    expect(() => buildEnsAgentHierarchy("alice.eth", [{ id: "supervisor" }, { id: "supervisor" }])).toThrow(/unique/)
  })

  it("creates distinct text-key resources for each agent endpoint", () => {
    expect(agentTextKey("research", "endpoint")).toBe("voxmesh.agent.research.endpoint")
    expect(agentTextKey("research", "endpoint")).not.toBe(agentTextKey("security", "endpoint"))
    expect(() => agentTextKey("Research", "endpoint")).toThrow(/Invalid ENS text key/)
  })

  it("omits transfer permission by default and includes it when requested", () => {
    expect(agentTransferRole(false)).not.toBe(agentTransferRole(true))
    expect(agentTransferRole(false) & (1n << 156n)).toBe(0n)
    expect(agentTransferRole(true) & (1n << 156n)).not.toBe(0n)
  })
})