import {
  ExecutionPlanSchema,
  FinalReportSchema,
  ResearchReportSchema,
  SecurityAssessmentSchema,
  type ExecutionPlan,
  type FinalReport,
  type InferenceMetadata,
  type Task,
} from "../../shared/schemas"
import { inferStructured, type Agent, type AgentContext, type AgentOutput } from "../runtime/types"
import { ANALYSIS_DISCLAIMER, heuristicAggregate } from "./heuristics"

const PLAN_SYSTEM = `You are the VoxMesh Supervisor. You plan multi-agent workflows. Available specialist capabilities:
- "contract_research" (type "research"): Research Agent analyses supplied Solidity source.
- "security_review" (type "security_review"): Security Agent reviews source + research output for risks.
Rules: only include steps the user actually needs. If the user wants both research and security, the security step
depends on the research step unless the user asks for them in parallel/independently. If the request is not about a
contract, return no steps and answer directly in "directAnswer". Never include more than 2 steps.
Reply with ONLY JSON: {"intent": "full_audit"|"contract_research"|"security_review"|"general_question",
"reasoning": string (<= 50 words), "steps": [{"id": "research"|"security", "type": "research"|"security_review",
"capability": "contract_research"|"security_review", "description": string, "dependsOn": string[]}], "directAnswer": string|null}`

const AGG_SYSTEM = `You are the VoxMesh Supervisor aggregating specialist outputs into a final report for the user.
Use only facts present in the inputs. Include the risk level and the top findings. State clearly this is static analysis, not an audit.
Reply with ONLY JSON: {"title": string, "markdown": string (GitHub markdown, <= 350 words), "spokenSummary": string (<= 45 words, plain speech),
"overallRisk": "critical"|"high"|"medium"|"low"|"info"|null, "riskScore": number|null, "disclaimer": string}`

export class SupervisorAgent implements Agent {
  readonly id = "supervisor" as const
  readonly name = "Supervisor"
  readonly description = "Interprets requests, plans bounded workflows, delegates to specialists via Arkiv tasks and aggregates their results."
  readonly capabilities = ["planning" as const, "delegation" as const, "aggregation" as const]

  async plan(ctx: AgentContext, hasSource: boolean): Promise<{ plan: ExecutionPlan | null; inference: InferenceMetadata[]; error: string | null }> {
    const { value, inference, error } = await inferStructured(
      ctx,
      this.id,
      "plan",
      [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: `Contract source supplied: ${hasSource ? "yes" : "no"}\nUser request: ${ctx.command}` },
      ],
      ExecutionPlanSchema,
      { command: ctx.command, hasSource },
      null,
    )
    return { plan: value, inference, error }
  }

  /** Aggregation step — runs on the Supervisor itself, after all delegated tasks settle. */
  async execute(task: Task, ctx: AgentContext): Promise<AgentOutput> {
    const r = ResearchReportSchema.safeParse(task.input.research)
    const s = SecurityAssessmentSchema.safeParse(task.input.security)
    const research = r.success ? r.data : null
    const security = s.success ? s.data : null
    const failures = Array.isArray(task.input.failures) ? (task.input.failures as string[]) : []

    const { value, inference, error } = await inferStructured(
      ctx,
      this.id,
      "aggregate",
      [
        { role: "system", content: AGG_SYSTEM },
        {
          role: "user",
          content: `User request: ${ctx.command}\nResearch: ${JSON.stringify(research)}\nSecurity: ${JSON.stringify(security)}\nFailed steps: ${JSON.stringify(failures)}`,
        },
      ],
      FinalReportSchema,
      { command: ctx.command, research, security },
      task.id,
    )
    let report: FinalReport = value ?? heuristicAggregate(ctx.command, research, security)
    // Deterministic guardrails: risk numbers come from the Security Agent's validated output, and the disclaimer is mandatory.
    report = {
      ...report,
      overallRisk: security?.overallRisk ?? null,
      riskScore: security?.riskScore ?? null,
      disclaimer: ANALYSIS_DISCLAIMER,
      markdown: failures.length ? `${report.markdown}\n\n> ⚠️ Incomplete: ${failures.join("; ")}` : report.markdown,
    }
    return { result: { report, llmFallback: value === null, llmError: error }, inference }
  }
}
