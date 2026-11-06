import { z } from "zod"
import type { Task } from "../../shared/schemas"
import { AppError } from "../lib/errors"
import type { Agent, AgentContext, AgentOutput } from "../runtime/types"

const TextOrNumberSchema = z.union([z.string(), z.number()])
const JsonArraySchema = z.union([z.array(z.unknown()), z.string()])

const GammaMarketSchema = z.object({
  id: TextOrNumberSchema.optional(),
  question: z.string().optional(),
  slug: z.string().optional(),
  resolutionSource: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  acceptingOrders: z.boolean().optional(),
  outcomes: JsonArraySchema.optional(),
  outcomePrices: JsonArraySchema.optional(),
  bestBid: TextOrNumberSchema.nullable().optional(),
  bestAsk: TextOrNumberSchema.nullable().optional(),
  liquidity: TextOrNumberSchema.nullable().optional(),
  liquidityNum: TextOrNumberSchema.nullable().optional(),
  volume24hr: TextOrNumberSchema.nullable().optional(),
  orderPriceMinTickSize: TextOrNumberSchema.nullable().optional(),
}).passthrough()

const GammaEventSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  markets: z.array(GammaMarketSchema).optional(),
}).passthrough()

const GammaSearchResponseSchema = z.object({
  events: z.array(GammaEventSchema).optional(),
  markets: z.array(GammaMarketSchema).optional(),
}).passthrough()

export const MarketSnapshotSchema = z.object({
  marketId: z.string(),
  eventTitle: z.string(),
  question: z.string(),
  slug: z.string(),
  marketUrl: z.string().url(),
  resolutionSource: z.string().nullable(),
  endDate: z.string().nullable(),
  yesProbability: z.number().min(0).max(1),
  noProbability: z.number().min(0).max(1),
  bestBid: z.number().min(0).max(1).nullable(),
  bestAsk: z.number().min(0).max(1).nullable(),
  liquidityUsd: z.number().nonnegative().nullable(),
  volume24hUsd: z.number().nonnegative().nullable(),
  fetchedAt: z.string(),
})
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>

export function extractMarketQuery(command: string): string {
  const quoted = command.match(/["“]([^"”]+)["”]/)
  if (quoted?.[1]) return quoted[1].trim()
  const labeled = command.match(/(?:market|question)\s*:\s*(.+)$/i)
  return (labeled?.[1] ?? command).trim().replace(/[.!?]+$/, "")
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMarket(market: z.infer<typeof GammaMarketSchema>, event: z.infer<typeof GammaEventSchema> | null): MarketSnapshot | null {
  if (market.active !== true || market.closed !== false || market.acceptingOrders !== true || !market.slug) return null
  const outcomes = parseJsonArray(market.outcomes).map((value) => String(value).toLowerCase())
  const prices = parseJsonArray(market.outcomePrices).map(numberOrNull)
  const yesIndex = outcomes.indexOf("yes")
  const noIndex = outcomes.indexOf("no")
  const yesProbability = yesIndex >= 0 ? prices[yesIndex] : null
  const noProbability = noIndex >= 0 ? prices[noIndex] : null
  if (yesProbability === null || noProbability === null || yesProbability < 0 || yesProbability > 1 || noProbability < 0 || noProbability > 1) return null

  const question = market.question ?? event?.title
  if (!question) return null

  return {
    marketId: String(market.id ?? market.slug),
    eventTitle: event?.title ?? question,
    question,
    slug: market.slug,
    marketUrl: `https://polymarket.com/event/${market.slug}`,
    resolutionSource: market.resolutionSource ?? null,
    endDate: market.endDate ?? null,
    yesProbability,
    noProbability,
    bestBid: numberOrNull(market.bestBid),
    bestAsk: numberOrNull(market.bestAsk),
    liquidityUsd: numberOrNull(market.liquidityNum) ?? numberOrNull(market.liquidity),
    volume24hUsd: numberOrNull(market.volume24hr),
    fetchedAt: new Date().toISOString(),
  }
}

export async function researchPolymarketMarket(
  query: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<MarketSnapshot> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) throw new AppError("MARKET_QUERY_REQUIRED", "Ask about a specific Polymarket question.", 400)

  const url = new URL("https://gamma-api.polymarket.com/public-search")
  url.searchParams.set("q", normalizedQuery)
  url.searchParams.set("limit", "10")
  let response: Response
  try {
    response = await fetchImpl(url, { signal, headers: { accept: "application/json" } })
  } catch (error) {
    throw new AppError("POLYMARKET_UNAVAILABLE", `Polymarket public search failed: ${error instanceof Error ? error.message : String(error)}`, 502)
  }
  if (!response.ok) throw new AppError("POLYMARKET_UNAVAILABLE", `Polymarket public search returned HTTP ${response.status}.`, 502)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AppError("POLYMARKET_BAD_RESPONSE", "Polymarket public search returned invalid JSON.", 502)
  }
  const parsed = GammaSearchResponseSchema.safeParse(payload)
  if (!parsed.success) throw new AppError("POLYMARKET_BAD_RESPONSE", "Polymarket public search returned an unexpected response shape.", 502)

  const candidates = [
    ...(parsed.data.events ?? []).flatMap((event) => (event.markets ?? []).map((market) => ({ market, event }))),
    ...(parsed.data.markets ?? []).map((market) => ({ market, event: null })),
  ]
  for (const candidate of candidates) {
    const snapshot = normalizeMarket(candidate.market, candidate.event)
    if (snapshot) return snapshot
  }
  throw new AppError("POLYMARKET_NO_OPEN_MARKET", `No open, order-accepting binary market matched “${normalizedQuery}”.`, 404)
}

export class LiquiditySimulationAgent implements Agent {
  readonly id = "liquidity" as const
  readonly name = "Liquidity Simulation"
  readonly description = "Produces capped, simulation-only Polymarket two-sided quotes from public market data; it cannot submit orders."
  readonly capabilities = ["liquidity_simulation" as const]

  async execute(task: Task, context: AgentContext): Promise<AgentOutput> {
    const researchOutput = context.dependencies["market-research"]?.record.output
    const parsed = z.object({ market: MarketSnapshotSchema }).safeParse(researchOutput)
    if (!parsed.success) throw new AppError("MARKET_RESEARCH_MISSING", "Liquidity simulation requires a valid market research result.", 422)
    const market = parsed.data.market

    const hasBook = market.bestBid !== null && market.bestAsk !== null && market.bestAsk > market.bestBid
    const center = hasBook ? (market.bestBid! + market.bestAsk!) / 2 : market.yesProbability
    const observedSpread = hasBook ? market.bestAsk! - market.bestBid! : 0.04
    const tick = 0.001
    const edge = Math.max(tick, Math.min(0.02, observedSpread / 4))
    const yesBid = roundPrice(Math.max(tick, Math.min(center - edge, (hasBook ? market.bestAsk! : 1) - tick)))
    const yesAsk = roundPrice(Math.min(1 - tick, Math.max(center + edge, (hasBook ? market.bestBid! : 0) + tick)))
    if (yesBid >= yesAsk) throw new AppError("MARKET_BOOK_TOO_TIGHT", "The market spread is too tight for the demo quote policy.", 422)

    const perQuoteNotionalUsd = 5
    const quotes = [
      { outcome: "Yes", side: "bid", price: yesBid, maxShares: roundShares(perQuoteNotionalUsd / yesBid), notionalCapUsd: perQuoteNotionalUsd },
      { outcome: "Yes", side: "ask", price: yesAsk, maxShares: roundShares(perQuoteNotionalUsd / yesAsk), notionalCapUsd: perQuoteNotionalUsd },
      { outcome: "No", side: "bid", price: roundPrice(1 - yesAsk), maxShares: roundShares(perQuoteNotionalUsd / (1 - yesAsk)), notionalCapUsd: perQuoteNotionalUsd },
      { outcome: "No", side: "ask", price: roundPrice(1 - yesBid), maxShares: roundShares(perQuoteNotionalUsd / (1 - yesBid)), notionalCapUsd: perQuoteNotionalUsd },
    ]
    const riskNotes = [
      "Quotes are a deterministic demo, not investment advice or an execution instruction.",
      "Prices and liquidity are a point-in-time public snapshot and can move before any order is placed.",
      "No orders, approvals, deposits, or market transactions are submitted by this agent.",
      market.liquidityUsd !== null && market.liquidityUsd < 1000 ? "Reported market liquidity is below $1,000." : null,
      observedSpread > 0.1 ? "Observed best-bid/ask spread exceeds 10 percentage points." : null,
    ].filter((note): note is string => note !== null)

    context.trace({
      agentId: this.id,
      taskId: task.id,
      action: "tool.invoked",
      status: "ok",
      detail: `Simulated four capped quotes for ${market.question}; no orders were sent.`,
      data: { marketUrl: market.marketUrl, perQuoteNotionalUsd, simulated: true },
    })
    return {
      result: {
        simulationOnly: true,
        marketUrl: market.marketUrl,
        question: market.question,
        midpoint: roundPrice(center),
        observedSpread,
        perQuoteNotionalUsd,
        totalQuoteNotionalCapUsd: perQuoteNotionalUsd * quotes.length,
        quotes,
        riskNotes,
      },
      inference: [],
    }
  }
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000
}

function roundShares(value: number): number {
  return Math.round(value * 100) / 100
}