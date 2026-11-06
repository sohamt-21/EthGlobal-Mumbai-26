import { z } from "zod"
import type { IntegrationStatus } from "../../../shared/schemas"
import { AppError, errorMessage, redact } from "../../lib/errors"
import { nowIso } from "../../lib/async"
import type { InferenceAdapter, InferenceRequest, InferenceResponse } from "./types"

/**
 * 0G Private Computer / Router adapter.
 *
 * OpenAI-compatible `POST {baseUrl}/chat/completions` with `Authorization: Bearer <key>`.
 * Every router response includes `x_0g_trace { request_id, provider, billing }`, and
 * `tee_verified` when the request sets `verify_tee: true`.
 * Docs: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview
 */
const ZeroGResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          reasoning_content: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
    })
    .partial()
    .optional(),
  x_0g_trace: z
    .object({
      request_id: z.string(),
      provider: z.string().optional(),
      billing: z
        .object({ input_cost: z.string(), output_cost: z.string(), total_cost: z.string() })
        .partial()
        .optional(),
      tee_verified: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  tee_verified: z.boolean().optional(),
})

export type ZeroGOptions = {
  apiKey: string
  baseUrl: string
  model: string
  trustMode?: string
  verifyTee: boolean
  disableThinking: boolean
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class ZeroGInferenceAdapter implements InferenceAdapter {
  readonly mode = "live" as const
  readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly opts: ZeroGOptions) {
    this.model = opts.model
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      "Content-Type": "application/json",
    }
    if (this.opts.trustMode) headers["X-0G-Provider-Trust-Mode"] = this.opts.trustMode
    return headers
  }

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now()
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1800,
    }
    if (this.opts.verifyTee) body.verify_tee = true
    if (this.opts.disableThinking) body.chat_template_kwargs = { enable_thinking: false }

    const timeout = AbortSignal.timeout(this.opts.timeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout

    let response: Response
    try {
      response = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      throw new AppError("INFERENCE_UNREACHABLE", `0G router unreachable: ${redact(errorMessage(error))}`, 502, undefined, true)
    }

    const text = await response.text()
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      throw new AppError(
        "INFERENCE_FAILED",
        `0G router returned ${response.status}: ${redact(text.slice(0, 300))}`,
        502,
        { status: response.status },
        retryable,
      )
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new AppError("INFERENCE_BAD_RESPONSE", "0G router returned non-JSON body", 502, undefined, true)
    }
    const parsed = ZeroGResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new AppError("INFERENCE_BAD_RESPONSE", "0G router response did not match the chat-completions shape", 502)
    }
    const data = parsed.data
    const trace = data.x_0g_trace
    const content = data.choices[0].message.content ?? ""
    if (!trace?.request_id) {
      // A real router response always carries x_0g_trace. Refuse to fabricate an ID.
      throw new AppError("INFERENCE_NO_TRACE", "0G response is missing x_0g_trace.request_id", 502)
    }

    return {
      content,
      metadata: {
        provider: "0g",
        requestId: trace.request_id,
        model: data.model ?? this.model,
        providerAddress: trace.provider ?? null,
        teeVerified: trace.tee_verified ?? data.tee_verified ?? null,
        trustMode: this.opts.trustMode ?? null,
        billing: trace.billing
          ? {
              inputCost: trace.billing.input_cost ?? "0",
              outputCost: trace.billing.output_cost ?? "0",
              totalCost: trace.billing.total_cost ?? "0",
            }
          : null,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : null,
        latencyMs: Date.now() - started,
        completionId: data.id ?? null,
        purpose: request.purpose,
        agentId: request.agentId,
        timestamp: nowIso(),
      },
    }
  }

  async status(): Promise<IntegrationStatus> {
    const base: Omit<IntegrationStatus, "connected" | "detail"> = {
      name: "0G Inference",
      mode: "live",
      meta: {
        baseUrl: this.opts.baseUrl,
        model: this.model,
        trustMode: this.opts.trustMode ?? "standard",
        verifyTee: this.opts.verifyTee,
      },
      checkedAt: nowIso(),
    }
    try {
      const res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, "")}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return { ...base, connected: false, detail: `GET /models → HTTP ${res.status}` }
      return { ...base, connected: true, detail: "0G router reachable with configured API key" }
    } catch (error) {
      return { ...base, connected: false, detail: redact(errorMessage(error)) }
    }
  }
}
