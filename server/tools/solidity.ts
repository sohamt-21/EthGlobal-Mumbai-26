import type { Severity, StaticSignal } from "../../shared/schemas"

/**
 * Deterministic, text-only Solidity inspection. This is pattern matching — not compilation,
 * symbolic execution or an audit. Every report produced from it says so.
 */

export type ContractSummary = {
  pragma: string | null
  contracts: { name: string; kind: "contract" | "interface" | "library" | "abstract"; inherits: string[] }[]
  functions: { name: string; visibility: string; modifiers: string[]; payable: boolean; line: number }[]
  events: string[]
  modifiers: string[]
  lineCount: number
}

const FUNCTION_RE = /function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*([^{;]*)/g
const CONTRACT_RE = /\b(abstract\s+contract|contract|interface|library)\s+([A-Za-z_]\w*)(?:\s+is\s+([^{]+))?\s*\{/g

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

export function summarizeContract(source: string): ContractSummary {
  const pragma = source.match(/pragma\s+solidity\s+([^;]+);/)?.[1]?.trim() ?? null
  const contracts: ContractSummary["contracts"] = []
  for (const m of source.matchAll(CONTRACT_RE)) {
    const raw = m[1].replace(/\s+/g, " ")
    const kind = raw === "abstract contract" ? "abstract" : (raw as "contract" | "interface" | "library")
    contracts.push({
      name: m[2],
      kind,
      inherits: (m[3] ?? "")
        .split(",")
        .map((s) => s.trim().split(/[\s(]/)[0])
        .filter(Boolean),
    })
  }
  const functions: ContractSummary["functions"] = []
  for (const m of source.matchAll(FUNCTION_RE)) {
    const tail = m[3]
    const visibility = tail.match(/\b(external|public|internal|private)\b/)?.[1] ?? "public"
    const reserved = new Set(["external", "public", "internal", "private", "view", "pure", "payable", "virtual", "override", "returns"])
    const modifiers = tail
      .replace(/returns\s*\([^)]*\)/, "")
      .split(/\s+/)
      .map((t) => t.replace(/\(.*$/, ""))
      .filter((t) => t && !reserved.has(t) && /^[A-Za-z_]\w*$/.test(t))
    functions.push({ name: m[1], visibility, modifiers, payable: /\bpayable\b/.test(tail), line: lineOf(source, m.index ?? 0) })
  }
  const events = [...source.matchAll(/\bevent\s+([A-Za-z_]\w*)/g)].map((m) => m[1])
  const modifiers = [...source.matchAll(/\bmodifier\s+([A-Za-z_]\w*)/g)].map((m) => m[1])
  return { pragma, contracts, functions, events, modifiers, lineCount: source.split("\n").length }
}

type Rule = { id: string; title: string; severity: Severity; category: string; test: RegExp }

const LINE_RULES: Rule[] = [
  { id: "tx-origin-auth", title: "tx.origin used for authorization", severity: "high", category: "access-control", test: /tx\.origin/ },
  { id: "delegatecall", title: "delegatecall to a dynamic target", severity: "high", category: "external-calls", test: /\.delegatecall\s*\(/ },
  { id: "selfdestruct", title: "selfdestruct present", severity: "critical", category: "lifecycle", test: /\bselfdestruct\s*\(/ },
  { id: "blacklist", title: "Owner-controlled address blacklist", severity: "high", category: "transfer-controls", test: /\b(blacklist|blocklist|isBlacklisted|_blocked|isBot)\b/i },
  { id: "fee-setter", title: "Adjustable transfer fee / tax", severity: "high", category: "economic", test: /function\s+set\w*(Fee|Tax)\w*\s*\(/i },
  { id: "pausable", title: "Transfers can be paused", severity: "medium", category: "transfer-controls", test: /\b(whenNotPaused|function\s+pause\s*\()/ },
  { id: "trading-gate", title: "Trading enable switch / max-tx limits", severity: "medium", category: "transfer-controls", test: /\b(tradingEnabled|tradingOpen|maxTxAmount|maxWallet)\b/ },
  { id: "upgradeable", title: "Upgradeable implementation", severity: "medium", category: "upgradeability", test: /\b(upgradeTo|upgradeToAndCall|_implementation|Initializable)\b/ },
  { id: "weak-randomness", title: "Block attributes used as randomness", severity: "medium", category: "randomness", test: /block\.(timestamp|prevrandao|difficulty)\s*%|keccak256\([^)]*block\.(timestamp|prevrandao|difficulty)/ },
  { id: "low-level-call", title: "Low-level call with value", severity: "medium", category: "external-calls", test: /\.call\s*\{\s*value\s*:/ },
  { id: "unchecked-math", title: "unchecked arithmetic block", severity: "low", category: "arithmetic", test: /\bunchecked\s*\{/ },
]

/**
 * Splits a source into function bodies with brace matching, so a few rules can reason within one function.
 */
function functionBodies(source: string): { name: string; start: number; body: string; header: string }[] {
  const out: { name: string; start: number; body: string; header: string }[] = []
  const re = /function\s+([A-Za-z_]\w*)\s*\([^)]*\)[^{;]*\{/g
  for (const m of source.matchAll(re)) {
    const open = (m.index ?? 0) + m[0].length - 1
    let depth = 0
    let end = open
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++
      else if (source[i] === "}") {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    out.push({ name: m[1], start: m.index ?? 0, body: source.slice(open, end + 1), header: m[0] })
  }
  return out
}

export function scanContract(source: string): StaticSignal[] {
  const signals: StaticSignal[] = []
  const seen = new Set<string>()
  const lines = source.split("\n")

  lines.forEach((text, i) => {
    const trimmed = text.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return
    for (const rule of LINE_RULES) {
      if (!rule.test.test(text)) continue
      const key = `${rule.id}`
      if (seen.has(key)) continue
      seen.add(key)
      signals.push({ id: rule.id, title: rule.title, severity: rule.severity, category: rule.category, line: i + 1, snippet: trimmed.slice(0, 160) })
    }
  })

  for (const fn of functionBodies(source)) {
    const ownerOnly = /\b(onlyOwner|onlyRole|onlyAdmin)\b/.test(fn.header)
    // External value transfer followed by a state write in the same function = classic reentrancy shape.
    const callIdx = fn.body.search(/\.call\s*\{\s*value\s*:|\.transfer\s*\(|\.send\s*\(/)
    if (callIdx !== -1) {
      const after = fn.body.slice(callIdx)
      if (/\b\w+\s*\[[^\]]+\]\s*(=|-=|\+=)/.test(after) && !/nonReentrant/.test(fn.header)) {
        const line = lineOf(source, fn.start)
        if (!seen.has("reentrancy")) {
          seen.add("reentrancy")
          signals.push({
            id: "reentrancy",
            title: `State updated after external call in ${fn.name}()`,
            severity: "critical",
            category: "reentrancy",
            line,
            snippet: fn.header.trim().slice(0, 160),
          })
        }
      }
    }
    if (ownerOnly && /\bmint\b|_mint\s*\(/.test(fn.name + fn.body) && !seen.has("owner-mint")) {
      seen.add("owner-mint")
      signals.push({
        id: "owner-mint",
        title: `Privileged minting via ${fn.name}()`,
        severity: "high",
        category: "supply",
        line: lineOf(source, fn.start),
        snippet: fn.header.trim().slice(0, 160),
      })
    }
    if (ownerOnly && /_transfer\s*\(\s*(from|account|_from)/.test(fn.body) && !seen.has("owner-transfer")) {
      seen.add("owner-transfer")
      signals.push({
        id: "owner-transfer",
        title: `Owner can move user balances via ${fn.name}()`,
        severity: "critical",
        category: "custody",
        line: lineOf(source, fn.start),
        snippet: fn.header.trim().slice(0, 160),
      })
    }
  }

  const privileged = summarizeContract(source).functions.filter((f) => f.modifiers.some((m) => /^only/.test(m)))
  if (privileged.length > 0) {
    signals.push({
      id: "privileged-functions",
      title: `${privileged.length} privileged function(s): ${privileged.map((f) => f.name).slice(0, 8).join(", ")}`,
      severity: "info",
      category: "access-control",
      line: privileged[0].line,
      snippet: privileged.map((f) => `${f.name}[${f.modifiers.join(",")}]`).join(" "),
    })
  }

  const order: Severity[] = ["critical", "high", "medium", "low", "info"]
  return signals.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
}
