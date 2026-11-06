import type {
  ExecutionPlan,
  FinalReport,
  ResearchReport,
  SecurityAssessment,
  SecurityFinding,
  Severity,
  StaticSignal,
} from "../../shared/schemas"
import type { ContractSummary } from "../tools/solidity"

/**
 * Deterministic logic shared by (a) the clearly-labelled mock inference adapter and
 * (b) the agents' fallback path when live model output fails validation.
 * Fallback use is always recorded in the trace (`plan.fallback` / `llmFallback: true`).
 */

export const ANALYSIS_DISCLAIMER =
  "Static, text-based analysis of supplied source assisted by an LLM. Not a formal audit: no compilation, " +
  "symbolic execution, on-chain state or deployment verification was performed."

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"]
export const maxSeverity = (items: Severity[]): Severity =>
  items.length === 0 ? "info" : SEVERITY_ORDER[Math.min(...items.map((s) => SEVERITY_ORDER.indexOf(s)))]

export function heuristicPlan(command: string, hasSource: boolean): ExecutionPlan {
  const c = command.toLowerCase()
  const wantsResearch = /research|analy[sz]|inspect|explain|summar|understand|what does/.test(c)
  const wantsSecurity = /secur|risk|vulnerab|audit|review|safe|scam|rug|exploit|finding/.test(c)
  const mentionsContract = /contract|solidity|token|vault|\.sol\b|0x[a-f0-9]{40}/.test(c)
  const parallel = /parallel|simultaneous|independent|at the same time/.test(c)

  if (!hasSource && !mentionsContract) {
    return {
      intent: "general_question",
      reasoning: "No contract source or contract-related request detected; the Supervisor answers directly without delegation.",
      steps: [],
      directAnswer:
        "VoxMesh coordinates a Research Agent and a Security Agent through Arkiv-backed tasks with 0G inference. " +
        "Supply a Solidity contract (or pick a sample) and ask for research and/or a security review to start a multi-agent workflow.",
    }
  }

  const research = {
    id: "research",
    type: "research" as const,
    capability: "contract_research" as const,
    description: "Analyse the supplied contract: structure, privileged roles, external interactions and notable behaviour.",
    dependsOn: [] as string[],
  }
  const security = {
    id: "security",
    type: "security_review" as const,
    capability: "security_review" as const,
    description: "Review the contract and research findings, identify risks and rank them by severity.",
    dependsOn: parallel ? [] : ["research"],
  }

  if (wantsSecurity && !wantsResearch) {
    return {
      intent: "security_review",
      reasoning: "The request asks only for a risk review, so only the Security Agent is delegated.",
      steps: [{ ...security, dependsOn: [] }],
      directAnswer: null,
    }
  }
  if (wantsResearch && !wantsSecurity) {
    return {
      intent: "contract_research",
      reasoning: "The request asks for analysis only, so only the Research Agent is delegated.",
      steps: [research],
      directAnswer: null,
    }
  }
  return {
    intent: "full_audit",
    reasoning: parallel
      ? "Research and security review were requested to run independently, so both are delegated in parallel."
      : "Security review depends on the research output, so tasks run sequentially: research → security.",
    steps: [research, security],
    directAnswer: null,
  }
}

export function heuristicResearch(summary: ContractSummary, signals: StaticSignal[]): ResearchReport {
  const main = summary.contracts.find((c) => c.kind === "contract") ?? summary.contracts[0]
  const privileged = summary.functions.filter((f) => f.modifiers.some((m) => /^only/.test(m)))
  const external = signals.filter((s) => s.category === "external-calls").map((s) => `${s.title} (line ${s.line})`)
  return {
    contractName: main?.name ?? "Unknown",
    summary:
      `${main?.name ?? "The contract"} (${summary.pragma ?? "unknown pragma"}) declares ${summary.functions.length} functions, ` +
      `${summary.events.length} events and inherits from ${main?.inherits.join(", ") || "nothing"}. ` +
      `${privileged.length} functions are restricted to privileged roles.`,
    components: summary.contracts.map((c) => `${c.kind} ${c.name}${c.inherits.length ? ` is ${c.inherits.join(", ")}` : ""}`),
    privilegedRoles: privileged.map((f) => `${f.name}() guarded by ${f.modifiers.join(", ")}`),
    externalInteractions: external,
    observations: signals.filter((s) => s.severity !== "info").map((s) => `${s.title} at line ${s.line ?? "?"}`),
  }
}

const RECOMMENDATIONS: Record<string, string> = {
  "tx-origin-auth": "Use msg.sender for authorization; tx.origin breaks composability and enables phishing relays.",
  delegatecall: "Restrict delegatecall targets to an immutable allowlist or remove the generic executor.",
  selfdestruct: "Remove selfdestruct; it is deprecated and lets a privileged caller destroy the contract.",
  blacklist: "Document blacklist governance, put it behind a timelock/multisig, or remove it.",
  "fee-setter": "Enforce an upper bound on fees in the setter and emit events; consider a timelock.",
  pausable: "Put pause authority behind a multisig and document emergency procedures.",
  "trading-gate": "Ensure trading cannot be disabled after launch; trading gates are common honeypot mechanics.",
  upgradeable: "Protect upgrades with a timelock and multisig; verify storage layout compatibility.",
  "weak-randomness": "Use a verifiable randomness source (e.g. VRF) instead of block attributes.",
  "low-level-call": "Check return values and follow checks-effects-interactions.",
  "unchecked-math": "Confirm unchecked blocks cannot overflow under adversarial input.",
  reentrancy: "Update balances before the external call (checks-effects-interactions) and add a reentrancy guard.",
  "owner-mint": "Cap supply or remove owner minting; otherwise holders can be diluted arbitrarily.",
  "owner-transfer": "Remove the ability for the owner to move arbitrary user balances.",
  "privileged-functions": "Review each privileged function and the key management of the owner role.",
}

export function heuristicSecurity(signals: StaticSignal[], research: ResearchReport | null): SecurityAssessment {
  const findings: SecurityFinding[] = signals
    .filter((s) => s.severity !== "info" || s.id === "privileged-functions")
    .slice(0, 12)
    .map((s, i) => ({
      id: `F-${String(i + 1).padStart(2, "0")}`,
      title: s.title,
      severity: s.severity,
      category: s.category,
      description: `Pattern "${s.id}" detected in source${research ? ` of ${research.contractName}` : ""}.`,
      evidence: `line ${s.line ?? "?"}: ${s.snippet}`,
      recommendation: RECOMMENDATIONS[s.id] ?? "Review manually.",
    }))
  const weights: Record<Severity, number> = { critical: 35, high: 20, medium: 8, low: 3, info: 0 }
  const riskScore = Math.min(100, findings.reduce((n, f) => n + weights[f.severity], 0))
  const overallRisk = maxSeverity(findings.filter((f) => f.severity !== "info").map((f) => f.severity))
  return {
    overallRisk,
    riskScore,
    summary:
      findings.length === 0
        ? "No risky patterns were detected by static inspection."
        : `${findings.length} findings; highest severity ${overallRisk}. Most significant: ${findings[0].title}.`,
    findings,
  }
}

export function heuristicAggregate(
  command: string,
  research: ResearchReport | null,
  security: SecurityAssessment | null,
): FinalReport {
  const lines: string[] = []
  const name = research?.contractName ?? "Contract"
  lines.push(`## ${name} — VoxMesh multi-agent report`, "")
  lines.push(`**Request:** ${command}`, "")
  if (research) {
    lines.push("### Research Agent", "", research.summary, "")
    if (research.privilegedRoles.length) lines.push("**Privileged roles**", ...research.privilegedRoles.map((r) => `- ${r}`), "")
  }
  if (security) {
    lines.push(`### Security Agent — overall risk **${security.overallRisk.toUpperCase()}** (${security.riskScore}/100)`, "", security.summary, "")
    for (const f of security.findings) lines.push(`- **[${f.severity.toUpperCase()}] ${f.title}** — ${f.recommendation}`)
    lines.push("")
  }
  lines.push(`> ${ANALYSIS_DISCLAIMER}`)
  const spoken = security
    ? `${name} analysed. Overall risk is ${security.overallRisk}, scoring ${security.riskScore} out of 100, with ${security.findings.length} findings. The most significant is: ${security.findings[0]?.title ?? "none"}.`
    : `${name} analysed. ${research?.summary ?? ""}`
  return {
    title: `${name} report`,
    markdown: lines.join("\n"),
    spokenSummary: spoken,
    overallRisk: security?.overallRisk ?? null,
    riskScore: security?.riskScore ?? null,
    disclaimer: ANALYSIS_DISCLAIMER,
  }
}
