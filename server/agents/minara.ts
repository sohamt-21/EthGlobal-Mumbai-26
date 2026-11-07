import { isAddress } from "viem"
import type { Task } from "../../shared/schemas"
import type { AppConfig } from "../config"
import { AppError } from "../lib/errors"
import type { Agent, AgentContext, AgentOutput } from "../runtime/types"

type MinaraRequest =
  | { service: "prediction-market"; body: { link: string; mode: "fast"; only_result: false; customPrompt: string } }
  | { service: "defi-guidance"; body: { mode: "fast"; stream: false; message: { role: "user"; content: string } } }
  | { service: "swap-intent"; body: { intent: string; walletAddress: string; chain: string }; executionMode: "unsigned-suggestion-only" }
  | { service: "perp-suggestion"; body: { symbol: string; style: "swing-trading"; marginUSD: 10; leverage: 1; strategy: "max-profit" }; executionMode: "suggestion-only" }

const API_BASE = "https://api.minara.ai/v1/developer"

export function isMinaraRequest(command: string): boolean {
  return /^\s*minara\b/i.test(command)
}

export class MinaraAgent implements Agent {
  readonly id = "minara" as const
  readonly name = "Minara"
  readonly description = "Calls Minara's paid, API-key-protected research endpoints; swap and perp responses are suggestions only."
  readonly capabilities = ["minara_assistant" as const]

  constructor(private readonly config: AppConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async execute(task: Task, context: AgentContext): Promise<AgentOutput> {
    const apiKey = this.config.MINARA_API_KEY
    if (!apiKey) throw new AppError("MINARA_NOT_CONFIGURED", "Set MINARA_API_KEY in the server .env to enable paid Minara API requests.", 503)

    const request = parseMinaraRequest(context.command)
    const path = request.service === "prediction-market"
      ? "/prediction-market-ask"
      : request.service === "defi-guidance"
        ? "/chat"
        : request.service === "swap-intent"
          ? "/intent-to-swap-tx"
          : "/perp-trading-suggestion"
    const url = `${API_BASE}${path}`
    context.trace({
      agentId: this.id,
      taskId: task.id,
      action: "tool.invoked",
      status: "info",
      detail: `Calling Minara ${request.service}; this consumes Minara account credits. No transaction will be submitted by this agent.`,
      data: { service: request.service },
    })

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request.body),
        signal: context.signal,
      })
    } catch (error) {
      throw new AppError("MINARA_REQUEST_FAILED", `Minara ${request.service} request failed: ${error instanceof Error ? error.message : String(error)}`, 502)
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      throw new AppError("MINARA_REQUEST_FAILED", `Minara ${request.service} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`, 502)
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new AppError("MINARA_BAD_RESPONSE", `Minara ${request.service} returned invalid JSON.`, 502)
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new AppError("MINARA_BAD_RESPONSE", `Minara ${request.service} returned an unexpected response shape.`, 502)
    }

    return {
      result: {
        service: request.service,
        data: data as Record<string, unknown>,
        executionMode: "executionMode" in request ? request.executionMode : "analysis-only",
        noTransactionSubmitted: true,
      },
      inference: [],
    }
  }
}

function parseMinaraRequest(command: string): MinaraRequest {
  const match = command.trim().match(/^minara\s+(prediction|defi|chat|swap|perp)\s*:\s*([\s\S]+)$/i)
  if (!match) {
    throw new AppError("MINARA_COMMAND_INVALID", "Use `Minara prediction: <Polymarket URL>`, `Minara defi: <question>`, `Minara swap: <intent> wallet <address> chain <name>`, or `Minara perp: <symbol>`.", 400)
  }

  const mode = match[1].toLowerCase()
  const input = match[2].trim()
  if (mode === "prediction") {
    const link = input.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.!?]+$/, "")
    if (!link) throw new AppError("MINARA_COMMAND_INVALID", "Provide a Polymarket event URL for prediction analysis.", 400)
    let parsedUrl: URL
    try {
      parsedUrl = new URL(link)
    } catch {
      throw new AppError("MINARA_COMMAND_INVALID", "The prediction market URL is invalid.", 400)
    }
    if (parsedUrl.hostname !== "polymarket.com" && !parsedUrl.hostname.endsWith(".polymarket.com")) {
      throw new AppError("MINARA_COMMAND_INVALID", "Minara prediction analysis accepts a Polymarket URL only.", 400)
    }
    return {
      service: "prediction-market",
      body: { link, mode: "fast", only_result: false, customPrompt: "Provide source-aware market analysis and uncertainty. Do not recommend or execute trades." },
    }
  }

  if (mode === "defi" || mode === "chat") {
    return { service: "defi-guidance", body: { mode: "fast", stream: false, message: { role: "user", content: input } } }
  }

  if (mode === "swap") {
    const walletMatch = input.match(/\bwallet(?:\s+address)?\s*[:=]?\s*(0x[a-fA-F0-9]{40})\b/i)
    if (!walletMatch || !isAddress(walletMatch[1], { strict: false })) {
      throw new AppError("MINARA_COMMAND_INVALID", "Add `wallet <0x-address>` to the swap intent; Minara only returns a suggestion and this agent will not submit it.", 400)
    }
    const intent = input.slice(0, walletMatch.index).replace(/[\s;,]+$/, "").trim()
    if (!intent) throw new AppError("MINARA_COMMAND_INVALID", "Provide a swap intent before the wallet address.", 400)
    const chain = input.match(/\bchain\s*[:=]?\s*([a-z0-9-]+)/i)?.[1] ?? "base"
    return { service: "swap-intent", body: { intent, walletAddress: walletMatch[1], chain }, executionMode: "unsigned-suggestion-only" }
  }

  const symbol = input.split(/[\s,]+/)[0]?.toUpperCase()
  if (!symbol || !/^[A-Z0-9._-]{2,12}$/.test(symbol)) {
    throw new AppError("MINARA_COMMAND_INVALID", "Provide a trading symbol, for example `Minara perp: BTC`.", 400)
  }
  return {
    service: "perp-suggestion",
    body: { symbol, style: "swing-trading", marginUSD: 10, leverage: 1, strategy: "max-profit" },
    executionMode: "suggestion-only",
  }
}