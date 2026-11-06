import { describe, expect, it } from "vitest"
import { heuristicPlan } from "../../server/agents/heuristics"
import { executionLayers, validatePlan } from "../../server/runtime/planner"
import { ToolRegistry, AGENT_TOOL_ALLOWLIST } from "../../server/tools/registry"
import { getSample } from "../../server/tools/samples"
import { scanContract, summarizeContract } from "../../server/tools/solidity"
import { parseSepoliaNativeTransfer } from "../../server/agents/wallet-transfer"
import { isMetaMaskConnectionPrompt } from "../../server/agents/metamask"
import type { Capability } from "../../shared/schemas"

const ALL: Set<Capability> = new Set(["contract_research", "source_analysis", "security_review", "risk_assessment", "wallet_transfer", "market_research", "liquidity_simulation"])

describe("wallet transfer parsing", () => {
  it("parses an explicit Sepolia native ETH transfer without floating-point conversion", () => {
    expect(parseSepoliaNativeTransfer("Send 0.001 Sepolia ETH to 0x000000000000000000000000000000000000dEaD")).toEqual({
      recipient: "0x000000000000000000000000000000000000dEaD",
      amountEth: "0.001",
      amountWei: "1000000000000000",
      chainId: 11155111,
    })
    expect(parseSepoliaNativeTransfer("Send 0.00123 sepolia eth to this address 0x5c553e27e588b9dE72A76d521b17610A97d45143")).toMatchObject({
      recipient: "0x5c553e27e588b9dE72A76d521b17610A97d45143",
      amountEth: "0.00123",
      amountWei: "1230000000000000",
    })
  })

  it("rejects missing networks, malformed addresses, zero value, and excess decimals", () => {
    expect(() => parseSepoliaNativeTransfer("Send 0.001 ETH to 0x000000000000000000000000000000000000dEaD")).toThrow(/Sepolia/)
    expect(() => parseSepoliaNativeTransfer("Send 0.001 Sepolia ETH to not-an-address")).toThrow(/address/)
    expect(() => parseSepoliaNativeTransfer("Send 0 Sepolia ETH to 0x000000000000000000000000000000000000dEaD")).toThrow(/greater than zero/)
    expect(() => parseSepoliaNativeTransfer("Send 0.0000000000000000001 Sepolia ETH to 0x000000000000000000000000000000000000dEaD")).toThrow(/specify a positive ETH amount/)
  })
})

describe("MetaMask connection prompt guard", () => {
  it("only matches the current origin during account connection, never the transaction stage", () => {
    const host = "127.0.0.1:49980"
    const permissionPrompt = `${host} is asking for your approval to review permissions`
    expect(isMetaMaskConnectionPrompt("connecting", permissionPrompt, host)).toBe(true)
    expect(isMetaMaskConnectionPrompt("transaction", permissionPrompt, host)).toBe(false)
    expect(isMetaMaskConnectionPrompt("connecting", "127.0.0.1:49981 is asking for your approval to review permissions", host)).toBe(false)
    expect(isMetaMaskConnectionPrompt("connecting", `${host} is asking to confirm a transaction`, host)).toBe(false)
  })
})

describe("solidity tools", () => {
  it("summarizes structure of the vault sample", () => {
    const s = summarizeContract(getSample("mesh-vault")!.source)
    expect(s.pragma).toBe("^0.8.19")
    expect(s.contracts[0].name).toBe("MeshVault")
    expect(s.functions.map((f) => f.name)).toEqual(expect.arrayContaining(["deposit", "withdraw", "execute"]))
  })

  it("detects reentrancy, delegatecall and weak randomness in the vault", () => {
    const ids = scanContract(getSample("mesh-vault")!.source).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(["reentrancy", "delegatecall", "weak-randomness"]))
  })

  it("detects owner mint, blacklist, fee setter, tx.origin and owner transfers in the token", () => {
    const ids = scanContract(getSample("mesh-token")!.source).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(["owner-mint", "blacklist", "fee-setter", "tx-origin-auth", "owner-transfer", "trading-gate"]))
  })

  it("does not flag a guarded checks-effects-interactions withdraw", () => {
    const src = `contract Safe { mapping(address=>uint) b; function withdraw(uint a) external nonReentrant { b[msg.sender] -= a; (bool ok,) = msg.sender.call{value: a}(""); require(ok); } }`
    expect(scanContract(src).map((s) => s.id)).not.toContain("reentrancy")
  })

  it("enforces the per-agent tool allowlist", () => {
    const tools = new ToolRegistry(AGENT_TOOL_ALLOWLIST)
    expect(() => tools.invoke("security", "solidity.summarize", { source: "contract A {}" })).toThrow(/not allowed/)
    expect(tools.invoke("research", "solidity.summarize", { source: "contract A {}" }).contracts).toHaveLength(1)
  })
})

describe("supervisor planning", () => {
  it("routes a full request to research → security (sequential)", () => {
    const plan = heuristicPlan("analyse this contract and review its security risks", true)
    expect(plan.intent).toBe("full_audit")
    expect(plan.steps.map((s) => s.id)).toEqual(["research", "security"])
    expect(plan.steps[1].dependsOn).toEqual(["research"])
  })

  it("invokes only the security agent for a security-only request", () => {
    const plan = heuristicPlan("is this token a rug pull? check risks", true)
    expect(plan.steps.map((s) => s.capability)).toEqual(["security_review"])
  })

  it("invokes only the research agent for an explanation request", () => {
    expect(heuristicPlan("explain what this contract does", true).steps.map((s) => s.id)).toEqual(["research"])
  })

  it("does not delegate general questions", () => {
    const plan = heuristicPlan("hello, what can you do?", false)
    expect(plan.intent).toBe("general_question")
    expect(plan.steps).toHaveLength(0)
  })

  it("routes a valid Sepolia transfer to the wallet agent without requiring contract source", () => {
    const plan = heuristicPlan("Send 0.001 Sepolia ETH to 0x000000000000000000000000000000000000dEaD", false)
    expect(plan.intent).toBe("wallet_transfer")
    expect(plan.steps.map((step) => [step.type, step.capability])).toEqual([["wallet_transfer", "wallet_transfer"]])
    expect(validatePlan(plan, new Set(["wallet_transfer"]), 1, false)).toMatchObject({ ok: true })
  })

  it("routes Polymarket LP requests to market research then simulation without contract source", () => {
    const plan = heuristicPlan('Simulate a Polymarket liquidity plan for "Another S&P 500 Company buys Bitcoin by December 31, 2026"', false)
    expect(plan.intent).toBe("prediction_market_simulation")
    expect(plan.steps.map((step) => [step.id, step.type, step.capability, step.dependsOn])).toEqual([
      ["market-research", "market_research", "market_research", []],
      ["lp-simulation", "liquidity_simulation", "liquidity_simulation", ["market-research"]],
    ])
    expect(validatePlan(plan, new Set(["market_research", "liquidity_simulation"]), 2, false)).toMatchObject({ ok: true })
  })

  it("plans independent steps when asked to run in parallel", () => {
    const plan = heuristicPlan("research and security review this contract in parallel", true)
    expect(executionLayers(plan.steps)).toHaveLength(1)
  })

  it("rejects plans with unknown capabilities, forward deps, aggregation, or too many steps", () => {
    const base = heuristicPlan("analyse and review security", true)
    expect(validatePlan(base, new Set(["contract_research"]), 3, true)).toMatchObject({ ok: false })
    const forward = { ...base, steps: [{ ...base.steps[0], dependsOn: ["security"] }, base.steps[1]] }
    expect(validatePlan(forward, ALL, 3, true)).toMatchObject({ ok: false })
    const agg = { ...base, steps: [{ ...base.steps[0], type: "aggregate" as const }] }
    expect(validatePlan(agg, ALL, 3, true)).toMatchObject({ ok: false })
    expect(validatePlan(base, ALL, 1, true)).toMatchObject({ ok: false })
    expect(validatePlan(base, ALL, 3, false)).toMatchObject({ ok: false, reason: expect.stringMatching(/source/) })
    expect(validatePlan(base, ALL, 3, true)).toMatchObject({ ok: true })
  })
})
