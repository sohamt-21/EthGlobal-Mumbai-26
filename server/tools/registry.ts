import { forbidden } from "../lib/errors"
import { getSample, SAMPLE_CONTRACTS } from "./samples"
import { scanContract, summarizeContract } from "./solidity"

/**
 * Allowlisted, deterministic tools. Agents can only invoke tools named in their allowlist,
 * the LLM never chooses or executes code, and every invocation is traced.
 */
export const TOOLS = {
  "solidity.summarize": (input: { source: string }) => summarizeContract(input.source),
  "solidity.static_scan": (input: { source: string }) => scanContract(input.source),
  "samples.lookup": (input: { id: string }) => getSample(input.id) ?? null,
  "samples.list": () => SAMPLE_CONTRACTS.map(({ id, name, description }) => ({ id, name, description })),
} as const

export type ToolName = keyof typeof TOOLS
type ToolInput<N extends ToolName> = Parameters<(typeof TOOLS)[N]>[0]
type ToolOutput<N extends ToolName> = ReturnType<(typeof TOOLS)[N]>

export type ToolInvocation = { tool: ToolName; agentId: string; durationMs: number }

export class ToolRegistry {
  constructor(
    private readonly allowlist: Record<string, readonly ToolName[]>,
    private readonly onInvoke?: (inv: ToolInvocation) => void,
  ) {}

  allowed(agentId: string): readonly ToolName[] {
    return this.allowlist[agentId] ?? []
  }

  invoke<N extends ToolName>(agentId: string, tool: N, input: ToolInput<N>): ToolOutput<N> {
    if (!this.allowed(agentId).includes(tool)) {
      throw forbidden(`Agent "${agentId}" is not allowed to use tool "${tool}"`)
    }
    const started = Date.now()
    const fn = TOOLS[tool] as (i: ToolInput<N>) => ToolOutput<N>
    const out = fn(input)
    this.onInvoke?.({ tool, agentId, durationMs: Date.now() - started })
    return out
  }
}

export const AGENT_TOOL_ALLOWLIST: Record<string, readonly ToolName[]> = {
  supervisor: ["samples.lookup", "samples.list"],
  research: ["solidity.summarize", "solidity.static_scan", "samples.lookup"],
  security: ["solidity.static_scan"],
}
