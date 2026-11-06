import { ResearchReportSchema, type Task } from "../../shared/schemas"
import { AppError } from "../lib/errors"
import { inferStructured, type Agent, type AgentContext, type AgentOutput } from "../runtime/types"
import { heuristicResearch } from "./heuristics"

const SYSTEM = `You are the VoxMesh Research Agent. You analyse Solidity source supplied by the user.
You are given the source and the output of deterministic static tools. Describe what the contract does,
its privileged roles and external interactions. Do not invent functions that are not in the source.
Reply with ONLY a JSON object of this exact shape:
{"contractName": string, "summary": string (<= 80 words), "components": string[], "privilegedRoles": string[],
 "externalInteractions": string[], "observations": string[] (<= 8 items, each <= 30 words)}`

export class ResearchAgent implements Agent {
  readonly id = "research" as const
  readonly name = "Research Agent"
  readonly description = "Analyses supplied smart-contract source with allowlisted static tools and 0G inference, producing a structured research report."
  readonly capabilities = ["contract_research" as const, "source_analysis" as const]
  readonly ensName = "research.voxmesh.eth"

  async execute(task: Task, ctx: AgentContext): Promise<AgentOutput> {
    const source = typeof task.input.source === "string" ? task.input.source : ""
    if (!source.trim()) throw new AppError("NO_SOURCE", "Research task has no contract source", 422)

    const summary = ctx.tools.invoke(this.id, "solidity.summarize", { source })
    ctx.trace({ agentId: this.id, taskId: task.id, action: "tool.invoked", status: "ok", detail: `solidity.summarize → ${summary.functions.length} functions, ${summary.contracts.length} contracts` })
    const signals = ctx.tools.invoke(this.id, "solidity.static_scan", { source })
    ctx.trace({ agentId: this.id, taskId: task.id, action: "tool.invoked", status: "ok", detail: `solidity.static_scan → ${signals.length} signals` })

    const { value, inference, error } = await inferStructured(
      ctx,
      this.id,
      "research",
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Task: ${task.description}\nUser request: ${ctx.command}\n\nStatic summary:\n${JSON.stringify(summary)}\n\nStatic signals:\n${JSON.stringify(signals)}\n\nSource:\n\`\`\`solidity\n${source.slice(0, 16_000)}\n\`\`\``,
        },
      ],
      ResearchReportSchema,
      { summary, signals },
      task.id,
    )

    const report = value ?? heuristicResearch(summary, signals)
    return {
      result: {
        report,
        staticSignals: signals,
        stats: { lines: summary.lineCount, functions: summary.functions.length, events: summary.events.length, pragma: summary.pragma },
        llmFallback: value === null,
        llmError: error,
        method: "static-text-analysis+llm",
      },
      inference,
    }
  }
}
