import type { Capability, ExecutionPlan, TaskType } from "../../shared/schemas"

const TYPE_FOR_CAPABILITY: Partial<Record<Capability, TaskType>> = {
  contract_research: "research",
  source_analysis: "research",
  security_review: "security_review",
  risk_assessment: "security_review",
  wallet_transfer: "wallet_transfer",
  market_research: "market_research",
  liquidity_simulation: "liquidity_simulation",
}

export type PlanValidation = { ok: true; plan: ExecutionPlan } | { ok: false; reason: string }

/**
 * Deterministic validation of an LLM-proposed plan. The Supervisor may *propose*; this decides.
 * - every step's capability must be offered by a discovered agent
 * - capability ↔ task type must match; aggregation is reserved for the Supervisor
 * - step ids unique, dependencies reference earlier steps (acyclic by construction)
 * - bounded number of delegated calls
 */
export function validatePlan(plan: ExecutionPlan, available: Set<Capability>, maxSteps: number, hasSource: boolean): PlanValidation {
  if (plan.steps.length > maxSteps) return { ok: false, reason: `Plan has ${plan.steps.length} steps; max is ${maxSteps}` }
  if (plan.intent === "general_question" && plan.steps.length > 0) return { ok: false, reason: "general_question plans must not delegate" }
  if (plan.intent !== "general_question" && plan.steps.length === 0) return { ok: false, reason: `${plan.intent} plan has no steps` }
  const marketSteps = plan.steps.filter((step) => step.capability === "market_research" || step.capability === "liquidity_simulation")
  if (plan.steps.some((step) => step.capability !== "wallet_transfer" && step.capability !== "market_research" && step.capability !== "liquidity_simulation") && !hasSource) {
    return { ok: false, reason: "Delegated analysis requires contract source" }
  }
  const walletSteps = plan.steps.filter((step) => step.capability === "wallet_transfer")
  if (plan.intent === "wallet_transfer" && walletSteps.length !== 1) {
    return { ok: false, reason: "wallet_transfer plans must contain exactly one wallet transfer step" }
  }
  if (plan.intent !== "wallet_transfer" && walletSteps.length > 0) {
    return { ok: false, reason: "Wallet transfers require the wallet_transfer intent" }
  }
  if (plan.intent === "prediction_market_simulation") {
    if (plan.steps.length !== 2 || marketSteps.length !== 2 || marketSteps.filter((step) => step.capability === "market_research").length !== 1 || marketSteps.filter((step) => step.capability === "liquidity_simulation").length !== 1) {
      return { ok: false, reason: "prediction_market_simulation plans require one market research step and one liquidity simulation step" }
    }
    if (walletSteps.length > 0) return { ok: false, reason: "Prediction-market simulation plans cannot submit wallet transfers" }
    const researchStep = marketSteps.find((step) => step.capability === "market_research")!
    const simulationStep = marketSteps.find((step) => step.capability === "liquidity_simulation")!
    if (!simulationStep.dependsOn.includes(researchStep.id)) {
      return { ok: false, reason: "Liquidity simulation must depend on market research" }
    }
  } else if (marketSteps.length > 0) {
    return { ok: false, reason: "Market tasks require the prediction_market_simulation intent" }
  }
  const seen = new Set<string>()
  for (const step of plan.steps) {
    if (seen.has(step.id)) return { ok: false, reason: `Duplicate step id ${step.id}` }
    if (step.type === "aggregate") return { ok: false, reason: "Aggregation is performed by the Supervisor, not delegated" }
    if (!available.has(step.capability)) return { ok: false, reason: `No registered agent offers capability ${step.capability}` }
    if (TYPE_FOR_CAPABILITY[step.capability] !== step.type) return { ok: false, reason: `Step ${step.id}: type ${step.type} does not match capability ${step.capability}` }
    for (const dep of step.dependsOn) {
      if (!seen.has(dep)) return { ok: false, reason: `Step ${step.id} depends on unknown or later step ${dep}` }
    }
    seen.add(step.id)
  }
  return { ok: true, plan }
}

/** Groups steps into layers that can run in parallel (Kahn's algorithm over dependsOn). */
export function executionLayers<T extends { id: string; dependsOn: string[] }>(steps: T[]): T[][] {
  const layers: T[][] = []
  const done = new Set<string>()
  let remaining = [...steps]
  while (remaining.length) {
    const ready = remaining.filter((s) => s.dependsOn.every((d) => done.has(d)))
    if (!ready.length) throw new Error("Cycle in plan dependencies")
    layers.push(ready)
    ready.forEach((s) => done.add(s.id))
    remaining = remaining.filter((s) => !ready.includes(s))
  }
  return layers
}
