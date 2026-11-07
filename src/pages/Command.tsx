import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Bot, CheckCircle2, CircleDashed, FileCode2, Loader2, Mic, MicOff, ShieldCheck, Sparkles, Square, TrendingUp, Volume2, VolumeX, Wallet, Workflow as WorkflowIcon, XCircle } from "lucide-react"
import { cn } from "cn"
import type { Workflow } from "../../shared/schemas"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AGENT_COLOR } from "@/components/Shell"
import { TraceTimeline } from "@/components/TraceTimeline"
import { Dot, Empty, KeyChip, Markdown, ModeBadge, Panel, SeverityBadge, StatusBadge, clock } from "@/components/common"
import { api, ApiError, type Sample } from "@/lib/api"
import { useIntegration, useRuntime } from "@/lib/runtime"
import { useSpeech } from "@/lib/speech"

export const DEMO_COMMAND =
  "Start a multi-agent workflow. Ask the research agent to analyse this smart contract and ask the security agent to review the findings. Return a combined report."

const TRANSFER_COMMAND = "Send 0.00123 sepolia eth to this address 0x5c553e27e588b9dE72A76d521b17610A97d45143"

const SUGGESTIONS = [
  DEMO_COMMAND,
  "Explain what this contract does and who controls it.",
  "Is this token a rug pull risk? Only run a security review.",
  "Run research and security review in parallel on this contract.",
  'Simulate a Polymarket liquidity plan for "Another S&P 500 Company buys Bitcoin by December 31, 2026"',
]

export function CommandPage({ onOpenTrace }: { onOpenTrace: (id: string) => void }) {
  const { workflows, upsertWorkflow, agents, identityConfig, identity } = useRuntime()
  const inference = useIntegration("0G Inference")
  const [samples, setSamples] = useState<Sample[]>([])
  const [sampleId, setSampleId] = useState<string>("mesh-vault")
  const [customSource, setCustomSource] = useState("")
  const [showSource, setShowSource] = useState(false)
  const [command, setCommand] = useState(TRANSFER_COMMAND)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const voiceRuns = useRef(new Set<string>())
  const spoken = useRef(new Set<string>())
  const historyEnd = useRef<HTMLDivElement>(null)

  const speech = useSpeech((text) => {
    setCommand(text)
    void run(text, "voice")
  })

  useEffect(() => {
    api.samples().then(setSamples).catch(() => undefined)
  }, [])

  const active = workflows.find((w) => w.id === activeId) ?? workflows[0] ?? null
  const history = useMemo(() => [...workflows].reverse().slice(-12), [workflows])
  const running = active && !active.completedAt

  // Speak the final report for voice-initiated workflows (or when auto-speak is on).
  useEffect(() => {
    for (const w of workflows) {
      if (w.completedAt && w.finalReport && !spoken.current.has(w.id) && (voiceRuns.current.has(w.id) || (autoSpeak && w.id === activeId))) {
        spoken.current.add(w.id)
        speech.speak(w.finalReport.spokenSummary)
      }
    }
  }, [workflows, autoSpeak, activeId, speech])

  useEffect(() => {
    historyEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [history.length, active?.status])

  async function run(text = command, channel: "voice" | "text" = "text") {
    if (!text.trim() || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const wf = await api.execute({
        command: text,
        channel,
        ...(showSource && customSource.trim() ? { contractSource: customSource } : sampleId ? { sampleContractId: sampleId } : {}),
      })
      if (channel === "voice") voiceRuns.current.add(wf.id)
      upsertWorkflow(wf)
      setActiveId(wf.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start workflow")
    } finally {
      setSubmitting(false)
    }
  }

  const needsHuman = identityConfig?.workflowRequiresHuman && !identity

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* Conversation */}
        <Panel
          title="Conversation"
          icon={<Sparkles />}
          actions={
            <button onClick={() => (speech.speaking ? speech.cancelSpeech() : setAutoSpeak((v) => !v))} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
              {speech.speaking ? <Square className="size-3.5" /> : autoSpeak ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {speech.speaking ? "Stop speaking" : autoSpeak ? "Voice replies on" : "Voice replies off"}
            </button>
          }
          bodyClassName="p-0"
        >
          <div className="vx-scroll max-h-[52vh] min-h-[280px] overflow-y-auto px-4 py-4">
            {history.length === 0 ? (
              <Empty icon={<Mic />} title="Say or type a command">
                Try the demo: the Supervisor plans the workflow, delegates tasks through Arkiv, and the Research and Security agents run inference on 0G.
              </Empty>
            ) : (
              <div className="grid gap-5">
                {history.map((w) => (
                  <ConversationTurn key={w.id} wf={w} active={w.id === active?.id} onSelect={() => setActiveId(w.id)} onOpenTrace={() => onOpenTrace(w.id)} />
                ))}
                <div ref={historyEnd} />
              </div>
            )}
          </div>
        </Panel>

        {/* Composer */}
        <div className="vx-panel p-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <button
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                disabled={!speech.sttSupported}
                aria-label={speech.listening ? "Stop listening" : "Start voice command"}
                className={cn(
                  "grid size-12 place-items-center rounded-full border transition-all",
                  speech.listening
                    ? "vx-mic-live border-violet-300/40 bg-gradient-to-br from-[var(--vx-violet)] to-[var(--vx-blue)] text-white"
                    : "border-white/10 bg-white/[0.04] text-foreground hover:border-violet-300/30 hover:bg-violet-500/10",
                  !speech.sttSupported && "cursor-not-allowed opacity-40",
                )}
              >
                {speech.sttSupported ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </button>
              <span className="vx-mono text-[9px] uppercase tracking-wider text-muted-foreground">{speech.listening ? "listening" : "voice"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <Textarea
                value={speech.listening && speech.interim ? speech.interim : command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run()
                }}
                rows={3}
                placeholder="Ask the Supervisor… (⌘/Ctrl + Enter to run)"
                className="min-h-[76px] resize-none border-white/[0.07] bg-black/20 text-[13px] leading-relaxed"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1">
                  <FileCode2 className="size-3.5 text-muted-foreground" />
                  <select
                    value={showSource ? "__custom" : sampleId}
                    onChange={(e) => {
                      if (e.target.value === "__custom") setShowSource(true)
                      else {
                        setShowSource(false)
                        setSampleId(e.target.value)
                      }
                    }}
                    className="bg-transparent text-[12px] outline-none"
                    aria-label="Contract source"
                  >
                    {samples.map((s) => (
                      <option key={s.id} value={s.id} className="bg-neutral-900">
                        {s.name}
                      </option>
                    ))}
                    <option value="__custom" className="bg-neutral-900">
                      Paste Solidity…
                    </option>
                  </select>
                </div>
                {samples.find((s) => s.id === sampleId) && !showSource && <span className="hidden text-[11px] text-muted-foreground md:inline">{samples.find((s) => s.id === sampleId)!.description}</span>}
                <div className="ml-auto flex items-center gap-2">
                  {inference && <ModeBadge mode={inference.mode} />}
                  <Button onClick={() => void run()} disabled={submitting || !command.trim() || Boolean(needsHuman)} className="bg-gradient-to-r from-[var(--vx-violet)] to-[var(--vx-blue)] text-white hover:opacity-90">
                    {submitting ? <Loader2 className="animate-spin" /> : <ArrowUp />} Run workflow
                  </Button>
                </div>
              </div>
              {showSource && (
                <Textarea
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  rows={8}
                  placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.20;&#10;contract MyContract { … }"
                  className="vx-mono mt-2 border-white/[0.07] bg-black/30 text-[11.5px]"
                />
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setCommand(s)} className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11px] text-muted-foreground hover:border-violet-300/25 hover:text-foreground">
                    {s.length > 58 ? `${s.slice(0, 56)}…` : s}
                  </button>
                ))}
              </div>
              {(error || speech.error || needsHuman) && (
                <div className="mt-2 text-[12px] text-amber-200">{error ?? speech.error ?? "This server requires a verified human (World ID) to start workflows — verify on the Identity page."}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right rail: live execution */}
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Current task" icon={<WorkflowIcon />} actions={active && <StatusBadge status={active.status} />}>
          {!active ? (
            <Empty title="No workflow yet" />
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <KeyChip value={active.id} label="wf" />
                {active.plan && <span className="vx-mono rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground">{active.plan.intent}</span>}
                {running && <Loader2 className="size-3.5 animate-spin text-[var(--vx-violet)]" />}
              </div>
              <PlanView wf={active} />
              <div>
                <div className="vx-mono mb-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Agent activity</div>
                <div className="grid gap-1.5">
                  {agents.map((a) => {
                    const busy = active.tasks.some((t) => t.assignedAgent === a.id && (t.status === "claimed" || t.status === "running")) || (a.id === "supervisor" && running && (active.status === "planning" || active.tasks.every((t) => ["completed", "failed", "cancelled"].includes(t.status))))
                    const lastTrace = [...active.trace].reverse().find((t) => t.agentId === a.id)
                    return (
                      <div key={a.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                        <span className="grid size-7 place-items-center rounded-md" style={{ background: `color-mix(in oklch, ${AGENT_COLOR[a.id]} 16%, transparent)`, color: AGENT_COLOR[a.id] }}>
                          {a.id === "security" ? <ShieldCheck className="size-3.5" /> : a.id === "research" ? <FileCode2 className="size-3.5" /> : a.id === "metamask" ? <Wallet className="size-3.5" /> : a.id === "liquidity" ? <TrendingUp className="size-3.5" /> : a.id === "minara" ? <Sparkles className="size-3.5" /> : <Bot className="size-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[12px] font-medium">
                            {a.name} <Dot tone={busy ? "violet" : "muted"} pulse={busy} />
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">{lastTrace ? lastTrace.detail : "Not involved"}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Live trace" icon={<CircleDashed />} actions={active && <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => onOpenTrace(active.id)}>Full trace →</button>} bodyClassName="p-0">
          <div className="vx-scroll max-h-[420px] overflow-y-auto px-4 py-3">{active ? <TraceTimeline trace={active.trace.slice(-40)} compact /> : <Empty title="Trace appears here" />}</div>
        </Panel>
      </div>
    </div>
  )
}

function PlanView({ wf }: { wf: Workflow }) {
  if (!wf.plan) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-3 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Supervisor is planning on {wf.inference[0]?.provider === "0g" ? "0G" : "the inference adapter"}…
      </div>
    )
  }
  const steps = wf.plan.steps
  return (
    <div>
      <div className="vx-mono mb-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Supervisor plan</div>
      <p className="mb-3 text-[12px] leading-relaxed text-foreground/75">{wf.plan.reasoning}</p>
      <div className="grid gap-1.5">
        {steps.map((s, i) => {
          const task = wf.tasks.find((t) => t.input.stepId === s.id)
          const status = task?.status ?? "open"
          return (
            <motion.div key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
              <span className="vx-mono grid size-5 place-items-center rounded bg-white/[0.06] text-[10px]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12px] font-medium">
                  <span style={{ color: AGENT_COLOR[task?.assignedAgent ?? s.id] }}>{s.capability}</span>
                  {s.dependsOn.length > 0 && <span className="vx-mono text-[10px] text-muted-foreground">← {s.dependsOn.join(", ")}</span>}
                </div>
                {task?.arkivEntityKey && <KeyChip value={task.arkivEntityKey} label="task" className="mt-1" />}
              </div>
              {status === "completed" ? <CheckCircle2 className="size-4 text-emerald-400" /> : status === "failed" || status === "cancelled" ? <XCircle className="size-4 text-red-400" /> : status === "open" ? <CircleDashed className="size-4 text-muted-foreground" /> : <Loader2 className="size-4 animate-spin text-[var(--vx-violet)]" />}
            </motion.div>
          )
        })}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[12px]">
          <span className="vx-mono grid size-5 place-items-center rounded bg-white/[0.06] text-[10px]">{steps.length + 1}</span>
          <span className="flex-1" style={{ color: AGENT_COLOR.supervisor }}>
            aggregation
          </span>
          {wf.finalReport ? <CheckCircle2 className="size-4 text-emerald-400" /> : <CircleDashed className="size-4 text-muted-foreground" />}
        </div>
      </div>
    </div>
  )
}

function ConversationTurn({ wf, active, onSelect, onOpenTrace }: { wf: Workflow; active: boolean; onSelect: () => void; onOpenTrace: () => void }) {
  const security = Object.values(wf.results).find((r) => r.agentId === "security" && r.status === "success")
  const findings = (security?.result.assessment as { findings?: { id: string; title: string; severity: "critical" | "high" | "medium" | "low" | "info"; corroborated?: boolean }[] } | undefined)?.findings ?? []
  return (
    <div className="grid gap-2.5" onClick={onSelect}>
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-violet-300/15 bg-violet-500/10 px-3.5 py-2.5 text-[13px] leading-relaxed">
        {wf.command}
        <div className="vx-mono mt-1 text-right text-[9.5px] text-muted-foreground">{clock(wf.startedAt)}</div>
      </div>
      <div className={cn("max-w-[95%] rounded-2xl rounded-bl-md border bg-white/[0.025] px-4 py-3 transition-colors", active ? "border-white/[0.12]" : "border-white/[0.06]")}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-medium" style={{ color: AGENT_COLOR.supervisor }}>
            Supervisor
          </span>
          <StatusBadge status={wf.status} />
          {wf.finalReport?.overallRisk && <SeverityBadge severity={wf.finalReport.overallRisk} />}
          {wf.finalReport?.riskScore != null && <span className="vx-mono text-muted-foreground">{wf.finalReport.riskScore}/100</span>}
          <button onClick={onOpenTrace} className="ml-auto text-muted-foreground hover:text-foreground">
            Trace →
          </button>
        </div>
        <AnimatePresence mode="wait">
          {wf.finalReport ? (
            <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Markdown text={wf.finalReport.markdown} />
              {findings.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] text-muted-foreground">
                  <span>{findings.filter((f) => f.corroborated).length}/{findings.length} findings corroborated by deterministic static checks</span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="progress" className="flex items-center gap-2 text-[12.5px] text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Loader2 className="size-3.5 animate-spin" />
              {wf.trace.at(-1)?.detail ?? "Starting…"}
            </motion.div>
          )}
        </AnimatePresence>
        {wf.error && <div className="mt-2 text-[12px] text-red-300">{wf.error}</div>}
      </div>
    </div>
  )
}
