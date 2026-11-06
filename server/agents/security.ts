import { ResearchReportSchema, SecurityAssessmentSchema, type SecurityFinding, type StaticSignal, type Task } from "../../shared/schemas"
import { AppError } from "../lib/errors"
import { inferStructured, type Agent, type AgentContext, type AgentOutput } from "../runtime/types"
import { heuristicSecurity } from "./heuristics"

const SYSTEM = `You are the VoxMesh Security Agent. You review Solidity source and a Research Agent report and
produce a risk assessment. Base every finding on concrete evidence in the source (quote the line or construct).
This is static review, not a formal audit — never claim the contract is safe or audited.
Reply with ONLY a JSON object of this exact shape:
{"overallRisk": "critical"|"high"|"medium"|"low"|"info", "riskScore": number 0-100, "summary": string (<= 60 words),
 "findings": [{"id": "F-01", "title": string, "severity": "critical"|"high"|"medium"|"low"|"info", "category": string,
 "description": string, "evidence": string, "recommendation": string}] (<= 10 findings, most severe first)}`

/** Deterministic cross-check: is an LLM finding backed by a static signal? */
function corroborate(finding: SecurityFinding, signals: StaticSignal[]): boolean {
  const text = `${finding.title} ${finding.category} ${finding.evidence}`.toLowerCase()
  return signals.some(
    (s) =>
      text.includes(s.category.toLowerCase()) ||
      text.includes(s.id.replace(/-/g, " ")) ||
      s.title
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 5)
        .some((w) => text.includes(w)),
  )
}

export class SecurityAgent implements Agent {
  readonly id = "security" as const
  readonly name = "Security Agent"
  readonly description = "Reviews research output and source for risks, producing severity-ranked findings cross-checked against deterministic signals."
  readonly capabilities = ["security_review" as const, "risk_assessment" as const]

  async execute(task: Task, ctx: AgentContext): Promise<AgentOutput> {
    const source = typeof task.input.source === "string" ? task.input.source : ""
    if (!source.trim()) throw new AppError("NO_SOURCE", "Security task has no contract source", 422)

    // Research output comes from the coordination store (Arkiv), not from in-process memory.
    const dep = Object.values(ctx.dependencies).find((d) => d.record.agentId === "research")
    const researchParsed = dep ? ResearchReportSchema.safeParse(dep.record.output.report) : null
    const research = researchParsed?.success ? researchParsed.data : null

    // Independent verification: re-run the scanner instead of trusting the research agent's claims.
    const signals = ctx.tools.invoke(this.id, "solidity.static_scan", { source })
    ctx.trace({ agentId: this.id, taskId: task.id, action: "tool.invoked", status: "ok", detail: `solidity.static_scan (independent re-check) → ${signals.length} signals` })

    const { value, inference, error } = await inferStructured(
      ctx,
      this.id,
      "security",
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `Task: ${task.description}\nUser request: ${ctx.command}\n\n` +
            `Research report (from Arkiv entity ${dep?.resultKey ?? "n/a"}):\n${research ? JSON.stringify(research) : "none — review the source directly"}\n\n` +
            `Deterministic static signals:\n${JSON.stringify(signals)}\n\nSource:\n\`\`\`solidity\n${source.slice(0, 16_000)}\n\`\`\``,
        },
      ],
      SecurityAssessmentSchema,
      { signals, research },
      task.id,
    )

    const assessment = value ?? heuristicSecurity(signals, research)
    const findings = assessment.findings.map((f) => ({ ...f, corroborated: corroborate(f, signals) }))
    const baseline = heuristicSecurity(signals, research)
    return {
      result: {
        assessment: { ...assessment, findings },
        corroboration: {
          corroborated: findings.filter((f) => f.corroborated).length,
          uncorroborated: findings.filter((f) => !f.corroborated).length,
          staticBaselineScore: baseline.riskScore,
          staticBaselineRisk: baseline.overallRisk,
        },
        researchEntityKey: dep?.resultKey ?? null,
        llmFallback: value === null,
        llmError: error,
        method: "static-text-analysis+llm",
      },
      inference,
    }
  }
}
