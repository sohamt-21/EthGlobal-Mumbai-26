import { createHash } from "node:crypto"
import type {
  AgentId,
  AgentResult,
  ExecuteWorkflowInput,
  ExecutionPlan,
  ExecutionTrace,
  InferenceMetadata,
  RuntimeStats,
  Task,
  Workflow,
} from "../../shared/schemas"
import type { InferenceAdapter } from "../adapters/inference/types"
import type { CoordinationStore, ExecutionRecord, WorkflowRecord } from "../adapters/store/types"
import { heuristicAggregate, heuristicPlan, isMinaraRequest, isPredictionMarketIntent } from "../agents/heuristics"
import type { SupervisorAgent } from "../agents/supervisor"
import { isNativeTransferIntent, parseSepoliaNativeTransfer, type SepoliaNativeTransfer } from "../agents/wallet-transfer"
import { extractMarketQuery } from "../agents/prediction-market"
import type { AppConfig } from "../config"
import { newId, nowIso, sleep, withRetry, withTimeout } from "../lib/async"
import { AppError, errorMessage, isTransient, notFound, redact } from "../lib/errors"
import type { ToolRegistry } from "../tools/registry"
import type { AgentMessageBus } from "./bus"
import { executionLayers, validatePlan } from "./planner"
import type { AgentRegistry } from "./registry"
import type { Agent, AgentContext, DependencyResult, TraceInput } from "./types"

type WorkflowTask = Workflow["tasks"][number]
type Initiator = Workflow["initiatedBy"]

export type OrchestratorDeps = {
  cfg: AppConfig
  store: CoordinationStore
  inference: InferenceAdapter
  registry: AgentRegistry
  bus: AgentMessageBus
  tools: ToolRegistry
  supervisor: SupervisorAgent
}

const toTask = ({ arkivEntityKey: _key, ...task }: WorkflowTask): Task => task

const INLINE_SOURCE_RE = /(\/\/\s*SPDX-License-Identifier[\s\S]*|pragma\s+solidity[\s\S]*)/

export class Orchestrator {
  private readonly workflows = new Map<string, Workflow>()
  private readonly sources = new Map<string, string>()

  constructor(private readonly d: OrchestratorDeps) {}

  /* ───────────── public API ───────────── */

  start(input: ExecuteWorkflowInput, initiator: Initiator): Workflow {
    const wf: Workflow = {
      id: newId("wf"),
      command: input.command.replace(INLINE_SOURCE_RE, "[inline contract source]").slice(0, 1000),
      status: "planning",
      plan: null,
      tasks: [],
      results: {},
      messages: [],
      trace: [],
      inference: [],
      finalReport: null,
      arkivRecordKey: null,
      initiatedBy: initiator,
      agentCalls: 0,
      error: null,
      startedAt: nowIso(),
      completedAt: null,
    }
    this.workflows.set(wf.id, wf)
    void this.run(wf, input).catch((error) => this.fail(wf, error))
    return this.view(wf)
  }

  /** Runs a workflow to completion (used by tests and the API's `wait` mode). */
  async execute(input: ExecuteWorkflowInput, initiator: Initiator): Promise<Workflow> {
    const started = this.start(input, initiator)
    const wf = this.workflows.get(started.id)!
    while (!wf.completedAt) await sleep(25)
    return this.view(wf)
  }

  get(id: string): Workflow {
    const wf = this.workflows.get(id)
    if (!wf) throw notFound(`Workflow ${id}`)
    return this.view(wf)
  }

  list(): Workflow[] {
    return [...this.workflows.values()].reverse().map((w) => this.view(w))
  }

  async stats(agentCount: number): Promise<RuntimeStats> {
    const currentWorkflows = [...this.workflows.values()]
    let persistedTasks: Task[] = []
    let persistedWorkflows: WorkflowRecord[] = []
    try {
      const [taskRows, workflowRows] = await Promise.all([
        this.d.store.queryTasks({ limit: 100 }),
        this.d.store.listWorkflows({ limit: 100 }),
      ])
      persistedTasks = taskRows.map((row) => row.data)
      persistedWorkflows = workflowRows.map((row) => row.data)
    } catch {
      // Keep current-process stats available when the coordination store is temporarily offline.
    }

    const tasksById = new Map<string, Task>(persistedTasks.map((task) => [task.id, task]))
    for (const workflow of currentWorkflows) {
      for (const task of workflow.tasks) tasksById.set(task.id, task)
    }
    const tasks = [...tasksById.values()]
    const now = Date.now()
    const persistedWorkflowIds = new Set(persistedWorkflows.map((workflow) => workflow.workflowId))
    const workflowIds = new Set([...persistedWorkflowIds, ...currentWorkflows.map((workflow) => workflow.id)])
    const inferenceCalls = persistedWorkflows.reduce((total, workflow) => total + workflow.inferenceRequestIds.length, 0) +
      currentWorkflows.filter((workflow) => !persistedWorkflowIds.has(workflow.id)).reduce((total, workflow) => total + workflow.inference.length, 0)
    const inferenceTimes = [
      ...persistedWorkflows.map((workflow) => workflow.lastInferenceAt ?? (workflow.inferenceRequestIds.length ? workflow.completedAt : null)),
      ...currentWorkflows.filter((workflow) => !persistedWorkflowIds.has(workflow.id)).map((workflow) => workflow.inference.at(-1)?.timestamp ?? null),
    ].filter((timestamp): timestamp is string => Boolean(timestamp))
    const lastInferenceAt = inferenceTimes.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null
    return {
      agents: agentCount,
      activeTasks: tasks.filter((task) => ["open", "claimed", "running"].includes(task.status) && Date.parse(task.expiresAt) > now).length,
      completedTasks: tasks.filter((t) => t.status === "completed").length,
      failedTasks: tasks.filter((t) => t.status === "failed").length,
      workflows: workflowIds.size,
      inferenceCalls,
      lastInferenceAt,
    }
  }

  recentInference(limit = 30): InferenceMetadata[] {
    return [...this.workflows.values()]
      .flatMap((w) => w.inference)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  /* ───────────── state helpers ───────────── */

  /** Client view: contract source is replaced by a hash + size so snapshots stay small. */
  private view(wf: Workflow): Workflow {
    return {
      ...wf,
      tasks: wf.tasks.map((t) => {
        const { source, ...rest } = t.input
        return { ...t, input: typeof source === "string" ? { ...rest, sourceBytes: source.length } : rest }
      }),
    }
  }

  private trace(wf: Workflow, entry: TraceInput) {
    const t: ExecutionTrace = {
      id: newId("tr"),
      workflowId: wf.id,
      taskId: entry.taskId ?? null,
      agentId: entry.agentId,
      action: entry.action,
      detail: redact(entry.detail),
      inferenceRequestId: entry.inferenceRequestId ?? null,
      arkivEntityId: entry.arkivEntityId ?? null,
      txHash: entry.txHash ?? null,
      status: entry.status,
      duration: entry.duration ?? null,
      timestamp: nowIso(),
      data: entry.data,
    }
    wf.trace.push(t)
    this.d.bus.emit({ id: newId("evt"), workflowId: wf.id, type: "trace", trace: t, timestamp: t.timestamp })
    this.snapshot(wf)
  }

  private snapshot(wf: Workflow) {
    this.d.bus.emit({ id: newId("evt"), workflowId: wf.id, type: "workflow", workflow: this.view(wf), timestamp: nowIso() })
  }

  private fail(wf: Workflow, error: unknown) {
    wf.status = "failed"
    wf.error = redact(errorMessage(error))
    wf.completedAt = nowIso()
    this.trace(wf, { agentId: "supervisor", action: "workflow.failed", status: "error", detail: wf.error })
  }

  private context(wf: Workflow, signal: AbortSignal, depth: number, dependencies: Record<string, DependencyResult> = {}): AgentContext {
    return {
      workflowId: wf.id,
      requestId: newId("req"),
      command: wf.command,
      depth,
      signal,
      inference: this.d.inference,
      tools: this.d.tools,
      store: this.d.store,
      dependencies,
      trace: (e) => this.trace(wf, e),
      onInference: (m) => wf.inference.push(m),
    }
  }

  private resolveSource(input: ExecuteWorkflowInput): { source: string | null; sampleId: string | null } {
    if (input.sampleContractId) {
      const sample = this.d.tools.invoke("supervisor", "samples.lookup", { id: input.sampleContractId })
      if (!sample) throw new AppError("UNKNOWN_SAMPLE", `Unknown sample contract ${input.sampleContractId}`, 400)
      return { source: sample.source, sampleId: sample.id }
    }
    if (input.contractSource?.trim()) return { source: input.contractSource, sampleId: null }
    const inline = input.command.match(INLINE_SOURCE_RE)?.[1]
    return { source: inline ?? null, sampleId: null }
  }

  /* ───────────── workflow ───────────── */

  private async run(wf: Workflow, input: ExecuteWorkflowInput) {
    const { cfg } = this.d
    const walletTransferIntent = isNativeTransferIntent(wf.command)
    const minaraIntent = isMinaraRequest(wf.command)
    const predictionMarketIntent = !minaraIntent && isPredictionMarketIntent(wf.command)
    let walletTransfer: SepoliaNativeTransfer | null = null
    if (walletTransferIntent) {
      try {
        walletTransfer = parseSepoliaNativeTransfer(wf.command)
      } catch {
        walletTransfer = null
      }
    }
    const { source, sampleId } = walletTransferIntent || predictionMarketIntent || minaraIntent ? { source: null, sampleId: null } : this.resolveSource(input)
    if (source && source.length > 24_000) throw new AppError("SOURCE_TOO_LARGE", "Contract source must be under 24 KB", 400)
    if (source) this.sources.set(wf.id, source)

    this.trace(wf, {
      agentId: "supervisor",
      action: "workflow.started",
      status: "info",
      detail: `Command received via ${input.channel}${sampleId ? ` · sample ${sampleId}` : source ? ` · ${source.length} bytes of source` : ""}`,
      data: { initiator: wf.initiatedBy.subject.slice(0, 12), verified: wf.initiatedBy.verified },
    })

    // 1. Plan (LLM proposes, deterministic validator decides)
    const planCtx = this.context(wf, AbortSignal.timeout(cfg.AGENT_TASK_TIMEOUT_MS), 0)
    const available = await this.d.registry.availableCapabilities()
    let plan: ExecutionPlan
    if (walletTransferIntent) {
      plan = heuristicPlan(wf.command, false)
    } else if (minaraIntent) {
      plan = heuristicPlan(wf.command, false)
    } else if (predictionMarketIntent) {
      plan = heuristicPlan(wf.command, false)
    } else try {
      const proposed = await withRetry(() => this.d.supervisor.plan(planCtx, Boolean(source)), {
        retries: cfg.AGENT_MAX_RETRIES,
        onRetry: (n, e) => this.trace(wf, { agentId: "supervisor", action: "task.retry", status: "error", detail: `Planner attempt ${n} failed: ${errorMessage(e)}` }),
      })
      const check = proposed.value.plan
        ? validatePlan(proposed.value.plan, available, cfg.MAX_AGENT_CALLS_PER_WORKFLOW - 1, Boolean(source))
        : ({ ok: false, reason: `Model output invalid: ${proposed.value.error}` } as const)
      if (check.ok) {
        plan = check.plan
      } else {
        plan = heuristicPlan(wf.command, Boolean(source))
        this.trace(wf, { agentId: "supervisor", action: "plan.fallback", status: "error", detail: `LLM plan rejected (${check.reason}); using deterministic planner` })
      }
    } catch (error) {
      if (!isTransient(error)) throw error
      plan = heuristicPlan(wf.command, Boolean(source))
      this.trace(wf, { agentId: "supervisor", action: "plan.fallback", status: "error", detail: `Planner inference unavailable (${errorMessage(error)}); using deterministic planner` })
    }
    const maxSteps = Math.max(0, cfg.MAX_AGENT_CALLS_PER_WORKFLOW - (walletTransfer || predictionMarketIntent || minaraIntent ? 0 : 1))
    const finalCheck = validatePlan(plan, available, maxSteps, Boolean(source))
    if (!finalCheck.ok) {
      // e.g. analysis requested without source: answer instead of delegating
      plan = {
        intent: "general_question",
        reasoning: finalCheck.reason,
        steps: [],
        directAnswer: `I can't start that workflow: ${finalCheck.reason}. Paste Solidity source or choose a sample contract, then ask again.`,
      }
    }
    wf.plan = plan
    this.trace(wf, {
      agentId: "supervisor",
      action: "plan.created",
      status: "ok",
      detail: `Intent ${plan.intent}: ${plan.steps.length ? plan.steps.map((s) => `${s.id}${s.dependsOn.length ? `←${s.dependsOn.join(",")}` : ""}`).join(" · ") : "no delegation"}`,
      data: { reasoning: plan.reasoning },
    })

    if (plan.steps.length === 0) {
      wf.finalReport = {
        title: "Supervisor response",
        markdown: plan.directAnswer ?? plan.reasoning,
        spokenSummary: (plan.directAnswer ?? plan.reasoning).slice(0, 300),
        overallRisk: null,
        riskScore: null,
        disclaimer: "No agents were delegated for this request.",
      }
      return this.finish(wf, "completed")
    }

    // 2. Delegate: discover agents through the registry (Arkiv), create task entities + delegation messages
    const stepToTask = new Map<string, WorkflowTask>()
    const delegations = []
    const expiresAt = new Date(Date.now() + cfg.ARKIV_TASK_TTL_HOURS * 3600_000).toISOString()
    for (const step of plan.steps) {
      const candidates = await this.d.registry.discover(step.capability)
      if (!candidates.length) throw new AppError("NO_AGENT", `No agent available for ${step.capability}`, 503)
      const assessed = candidates.map(({ agent }) => ({ agent, report: this.d.registry.trustReport(agent.id) }))
      for (const candidate of assessed) {
        this.trace(wf, {
          agentId: "supervisor",
          action: "agent.trust_checked",
          status: candidate.report.decision === "do_not_call" ? "error" : "info",
          detail: `${candidate.agent.id}: ${candidate.report.decision.replaceAll("_", " ")} (score ${candidate.report.score}/100)`,
          data: { agentId: candidate.agent.id, decision: candidate.report.decision, score: candidate.report.score, riskFlags: candidate.report.riskFlags },
        })
      }
      const eligible = assessed.filter(({ report }) => report.decision !== "do_not_call")
      if (!eligible.length) throw new AppError("NO_TRUSTED_AGENT", `No agent passed the trust check for ${step.capability}`, 503)
      const { agent: assignee, report: trustReport } = eligible[0]
      const task: WorkflowTask = {
        id: newId("task"),
        workflowId: wf.id,
        type: step.type,
        description: step.description,
        requiredCapability: step.capability,
        createdBy: "supervisor",
        assignedAgent: assignee.id,
        claimedBy: null,
        status: "open",
        priority: step.type === "security_review" ? 8 : 6,
        dependsOn: step.dependsOn.map((d) => stepToTask.get(d)!.id),
        input: {
          stepId: step.id,
          source,
          sampleId,
          sourceHash: source ? createHash("sha256").update(source).digest("hex").slice(0, 16) : null,
          transfer: step.type === "wallet_transfer" ? walletTransfer : null,
          marketQuery: step.type === "market_research" ? extractMarketQuery(wf.command) : null,
          trustReport,
        },
        resultEntityKey: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt,
        arkivEntityKey: null,
      }
      stepToTask.set(step.id, task)
      wf.tasks.push(task)
      const msg = this.d.bus.create({
        workflowId: wf.id,
        taskId: task.id,
        correlationId: task.id,
        from: "supervisor",
        to: assignee.id,
        type: "task.delegate",
        payload: { capability: step.capability, description: step.description, dependsOn: task.dependsOn, trustDecision: trustReport.decision, trustScore: trustReport.score },
      })
      delegations.push(msg)
    }

    const created = await this.d.store.createTasks(wf.tasks.map(toTask), delegations)
    for (const t of wf.tasks) {
      t.arkivEntityKey = created.taskKeys[t.id]
      this.trace(wf, {
        agentId: "supervisor",
        taskId: t.id,
        action: "task.created",
        status: "ok",
        detail: `Task ${t.type} → ${t.assignedAgent} persisted to ${this.d.store.mode === "live" ? "Arkiv" : "local dev store"}`,
        arkivEntityId: t.arkivEntityKey,
        txHash: created.txHash,
      })
    }
    for (const m of delegations) {
      wf.messages.push(m)
      this.d.bus.publish(m)
      this.trace(wf, {
        agentId: "supervisor",
        taskId: m.taskId,
        action: "message.sent",
        status: "info",
        detail: `task.delegate supervisor → ${m.receiverAgentId}`,
        arkivEntityId: created.messageKeys[m.id] ?? null,
        txHash: created.txHash,
      })
    }

    // 3. Execute the DAG layer by layer; independent steps in a layer run in parallel
    wf.status = "running"
    this.snapshot(wf)
    const layers = executionLayers(plan.steps)
    for (const layer of layers) {
      await Promise.all(
        layer.map(async (step) => {
          const task = stepToTask.get(step.id)!
          const failedDep = task.dependsOn.map((id) => wf.tasks.find((t) => t.id === id)!).find((t) => t.status !== "completed")
          if (failedDep) {
            task.status = "cancelled"
            this.trace(wf, { agentId: "supervisor", taskId: task.id, action: "task.skipped", status: "error", detail: `Skipped: dependency ${failedDep.id} ${failedDep.status}` })
            await this.d.store.setTaskStatus(task.arkivEntityKey!, "cancelled").catch(() => undefined)
            return
          }
          await this.runTask(wf, task, this.d.registry.get(task.assignedAgent!))
        }),
      )
    }

    // 4. Aggregate on the Supervisor
    const byStep = (id: string) => {
      const t = stepToTask.get(id)
      return t ? wf.results[t.id] : undefined
    }
    const research = byStep("research")?.status === "success" ? byStep("research")!.result.report : null
    const security = byStep("security")?.status === "success" ? byStep("security")!.result.assessment : null
    const failures = wf.tasks.filter((t) => t.status !== "completed").map((t) => `${t.type} ${t.status}`)
    if (plan.intent === "wallet_transfer") {
      const transferTask = stepToTask.get("wallet-transfer")
      const transferResult = transferTask ? wf.results[transferTask.id] : undefined
      const transactionHash = transferResult?.status === "success" ? transferResult.result.transactionHash : null
      const success = typeof transactionHash === "string"
      const detail = success
        ? `Submitted ${walletTransfer!.amountEth} Sepolia ETH to ${walletTransfer!.recipient}. Transaction hash: ${transactionHash}`
        : `No transaction was submitted. ${transferResult?.error?.message ?? "The MetaMask request failed."}`
      wf.finalReport = {
        title: success ? "Sepolia transfer submitted" : "Sepolia transfer not submitted",
        markdown: `**Status:** ${success ? "Submitted" : "Not submitted"}\n\n${detail}`,
        spokenSummary: detail,
        overallRisk: null,
        riskScore: null,
        disclaimer: "MetaMask signed this transaction only after user approval. Submission does not guarantee confirmation on-chain.",
      }
      await this.finish(wf, success ? "completed" : "failed")
      return
    }
    if (plan.intent === "minara_assistant") {
      const minaraResult = byStep("minara")
      const success = minaraResult?.status === "success"
      const service = typeof minaraResult?.result.service === "string" ? minaraResult.result.service : "Minara"
      const executionMode = typeof minaraResult?.result.executionMode === "string" ? minaraResult.result.executionMode : "analysis-only"
      const output = success ? JSON.stringify(minaraResult!.result.data, null, 2).slice(0, 5000) : null
      const detail = success
        ? `**Service:** ${service}\n\n\`\`\`json\n${output}${output!.length >= 5000 ? "\n...response truncated" : ""}\n\`\`\`\n\nNo transaction was submitted.`
        : `No Minara result was returned. ${minaraResult?.error?.message ?? "The Minara request failed."}`
      wf.finalReport = {
        title: success ? `Minara ${service}` : "Minara request failed",
        markdown: `**Mode:** ${executionMode}\n\n${detail}`,
        spokenSummary: success ? `Minara ${service} completed. No transaction was submitted.` : detail,
        overallRisk: null,
        riskScore: null,
        disclaimer: "Minara output is external analysis. Swap and perpetual results are suggestions only; this agent never signs or submits a trade.",
      }
      await this.finish(wf, success ? "completed" : "failed")
      return
    }
    if (plan.intent === "prediction_market_simulation") {
      const researchResult = byStep("market-research")
      const simulationResult = byStep("lp-simulation")
      const market = researchResult?.status === "success" ? researchResult.result.market as Record<string, unknown> : null
      const simulation = simulationResult?.status === "success" ? simulationResult.result : null
      const quotes = Array.isArray(simulation?.quotes)
        ? simulation.quotes as { outcome?: unknown; side?: unknown; price?: unknown; maxShares?: unknown; notionalCapUsd?: unknown }[]
        : []
      const succeeded = researchResult?.status === "success" && simulationResult?.status === "success" && simulation?.simulationOnly === true
      const details = succeeded
        ? [
            `**Market:** ${typeof market?.question === "string" ? market.question : "Polymarket market"}`,
            `**Source:** ${typeof market?.marketUrl === "string" ? market.marketUrl : "Polymarket public data"}`,
            `**Implied probability:** Yes ${typeof market?.yesProbability === "number" ? `${(market.yesProbability * 100).toFixed(1)}%` : "n/a"}; No ${typeof market?.noProbability === "number" ? `${(market.noProbability * 100).toFixed(1)}%` : "n/a"}`,
            "**Simulated quotes (not submitted):**",
            ...quotes.map((quote) => `- ${String(quote.outcome)} ${String(quote.side)} at ${typeof quote.price === "number" ? quote.price.toFixed(3) : "n/a"}; max ${typeof quote.maxShares === "number" ? quote.maxShares.toFixed(2) : "n/a"} shares / $${typeof quote.notionalCapUsd === "number" ? quote.notionalCapUsd.toFixed(2) : "n/a"}`),
            `**Total notional cap:** $${typeof simulation?.totalQuoteNotionalCapUsd === "number" ? simulation.totalQuoteNotionalCapUsd.toFixed(2) : "n/a"}`,
          ].join("\n\n")
        : `No LP simulation was produced. ${researchResult?.error?.message ?? simulationResult?.error?.message ?? "Market research or quote simulation failed."}`
      wf.finalReport = {
        title: succeeded ? "Polymarket LP simulation" : "Polymarket simulation failed",
        markdown: `**Mode:** ${succeeded ? "Simulation only" : "Stopped without orders"}\n\n${details}\n\nNo Polymarket orders or collateral transfers were submitted. The separate Sepolia test transfer does not fund Polymarket.`,
        spokenSummary: succeeded ? `Polymarket dry-run complete for ${typeof market?.question === "string" ? market.question : "the selected market"}. No orders were placed.` : details,
        overallRisk: null,
        riskScore: null,
        disclaimer: "Read-only public market snapshot and deterministic quote simulation; not financial advice or an order. No live market execution occurred.",
      }
      const completedTasks = wf.tasks.filter((task) => task.status === "completed").length
      const status = completedTasks === wf.tasks.length ? "completed" : completedTasks > 0 ? "partial" : "failed"
      await this.finish(wf, status)
      return
    }
    const aggTask: Task = {
      id: newId("task"),
      workflowId: wf.id,
      type: "aggregate",
      description: "Aggregate specialist results",
      requiredCapability: "aggregation",
      createdBy: "supervisor",
      assignedAgent: "supervisor",
      claimedBy: "supervisor",
      status: "running",
      priority: 9,
      dependsOn: wf.tasks.map((t) => t.id),
      input: { research, security, failures },
      resultEntityKey: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      expiresAt,
    }
    try {
      const agg = await withTimeout("aggregation", cfg.AGENT_TASK_TIMEOUT_MS, (signal) => this.d.supervisor.execute(aggTask, this.context(wf, signal, 0)))
      wf.finalReport = agg.result.report as Workflow["finalReport"]
    } catch (error) {
      this.trace(wf, { agentId: "supervisor", action: "inference.failed", status: "error", detail: `Aggregation inference failed: ${errorMessage(error)}` })
      wf.finalReport = heuristicAggregate(wf.command, null, null)
    }

    const completed = wf.tasks.filter((t) => t.status === "completed").length
    await this.finish(wf, completed === wf.tasks.length ? "completed" : completed > 0 ? "partial" : "failed")
  }

  private async finish(wf: Workflow, status: Workflow["status"]) {
    wf.status = status
    try {
      const ref = await this.d.store.saveWorkflow({
        workflowId: wf.id,
        command: wf.command.slice(0, 500),
        status,
        intent: wf.plan?.intent ?? "unknown",
        taskIds: wf.tasks.map((t) => t.id),
        taskKeys: wf.tasks.map((t) => t.arkivEntityKey ?? ""),
        overallRisk: wf.finalReport?.overallRisk ?? null,
        riskScore: wf.finalReport?.riskScore ?? null,
        initiatedBy: wf.initiatedBy.subject,
        inferenceRequestIds: wf.inference.map((i) => i.requestId),
        lastInferenceAt: wf.inference.at(-1)?.timestamp ?? null,
        startedAt: wf.startedAt,
        completedAt: nowIso(),
      })
      wf.arkivRecordKey = ref.key
      this.trace(wf, { agentId: "supervisor", action: "arkiv.write", status: "ok", detail: "Workflow execution record persisted", arkivEntityId: ref.key, txHash: ref.txHash })
    } catch (error) {
      this.trace(wf, { agentId: "supervisor", action: "arkiv.write", status: "error", detail: `Workflow record not persisted: ${errorMessage(error)}` })
    }
    wf.completedAt = nowIso()
    this.trace(wf, {
      agentId: "supervisor",
      action: status === "failed" ? "workflow.failed" : "workflow.completed",
      status: status === "failed" ? "error" : "ok",
      detail: `Workflow ${status} · ${wf.agentCalls} agent calls · ${wf.inference.length} inference calls`,
      duration: Date.parse(wf.completedAt) - Date.parse(wf.startedAt),
    })
  }

  /** Worker lifecycle: discover the task on Arkiv → claim → load dependencies from Arkiv → execute → persist result. */
  private async runTask(wf: Workflow, task: WorkflowTask, agent: Agent) {
    const { cfg, store, registry, bus } = this.d
    const started = Date.now()
    registry.setStatus(agent.id, "busy")

    try {
      // Discovery: the worker queries the coordination layer for open tasks matching its capability.
      let discovered = null
      for (let i = 0; i < 4 && !discovered; i++) {
        const open = await store.queryTasks({ workflowId: wf.id, status: "open", capability: task.requiredCapability })
        discovered = open.find((t) => t.data.id === task.id) ?? null
        this.trace(wf, {
          agentId: agent.id,
          taskId: task.id,
          action: "arkiv.read",
          status: discovered ? "ok" : "info",
          detail: `${agent.name} queried open ${task.requiredCapability} tasks: ${open.length} found${discovered ? "" : " (waiting for indexing)"}`,
          arkivEntityId: discovered?.key ?? null,
        })
        if (!discovered) await sleep(1500)
      }
      if (!discovered) throw new AppError("TASK_NOT_DISCOVERABLE", `Task ${task.id} was not found in the coordination store`, 502)

      const claimMsg = bus.create({ workflowId: wf.id, taskId: task.id, correlationId: task.id, from: agent.id, to: "supervisor", type: "task.claimed", payload: { agentId: agent.id } })
      const claim = await store.claimTask(discovered.key, agent.id, claimMsg)
      task.status = "claimed"
      task.claimedBy = agent.id
      wf.messages.push(claimMsg)
      bus.publish(claimMsg)
      this.trace(wf, { agentId: agent.id, taskId: task.id, action: "task.claimed", status: "ok", detail: `${agent.name} claimed task`, arkivEntityId: discovered.key, txHash: claim.txHash })

      // Dependencies are read back from the coordination store — shared memory, not in-process handoff.
      const dependencies: Record<string, DependencyResult> = {}
      for (const depId of task.dependsOn) {
        const dep = wf.tasks.find((t) => t.id === depId)!
        const storedDep = await store.getTask(dep.arkivEntityKey!)
        const resultKey = storedDep?.data.resultEntityKey
        if (!resultKey) throw new AppError("DEPENDENCY_MISSING", `Dependency ${depId} has no result entity`, 502)
        const record = await store.getExecution(resultKey)
        if (!record) throw new AppError("DEPENDENCY_MISSING", `Result entity ${resultKey} not found`, 502)
        dependencies[String(dep.input.stepId)] = { taskId: depId, stepId: String(dep.input.stepId), resultKey, record: record.data }
        this.trace(wf, { agentId: agent.id, taskId: task.id, action: "arkiv.read", status: "ok", detail: `Loaded ${record.data.agentId} result for dependency ${depId}`, arkivEntityId: resultKey })
      }

      task.status = "running"
      this.trace(wf, { agentId: agent.id, taskId: task.id, action: "task.started", status: "info", detail: `${agent.name} executing ${task.type}` })
      const fullTask: Task = { ...task, input: { ...task.input, source: this.sources.get(wf.id) ?? null } }
      const { value: output, attempts } = await withRetry(
        () => {
          if (wf.agentCalls >= cfg.MAX_AGENT_CALLS_PER_WORKFLOW) {
            throw new AppError("CALL_BUDGET_EXCEEDED", `Workflow exceeded ${cfg.MAX_AGENT_CALLS_PER_WORKFLOW} agent calls`, 429)
          }
          wf.agentCalls++
          const depth = 1
          if (depth > cfg.MAX_DELEGATION_DEPTH) throw new AppError("DEPTH_EXCEEDED", "Maximum delegation depth exceeded", 400)
          const timeoutMs = task.type === "wallet_transfer" ? cfg.METAMASK_CONFIRMATION_TIMEOUT_MS : cfg.AGENT_TASK_TIMEOUT_MS
          return withTimeout(`${agent.name} ${task.type}`, timeoutMs, (signal) =>
            agent.execute(fullTask, this.context(wf, signal, depth, dependencies)),
          )
        },
        {
          retries: task.type === "wallet_transfer" || task.type === "minara_assistant" ? 0 : cfg.AGENT_MAX_RETRIES,
          onRetry: (n, e) =>
            this.trace(wf, { agentId: agent.id, taskId: task.id, action: "task.retry", status: "error", detail: `Attempt ${n} failed (${errorMessage(e)}); retrying` }),
        },
      )

      const result: AgentResult = {
        requestId: newId("req"),
        taskId: task.id,
        agentId: agent.id,
        status: "success",
        result: output.result,
        inference: output.inference,
        durationMs: Date.now() - started,
        attempts,
        error: null,
      }
      await this.persistResult(wf, task, agent.id as AgentId, result)
      registry.activity(agent.id, `Completed ${task.type} for ${wf.id}`, "completed")
    } catch (error) {
      const result: AgentResult = {
        requestId: newId("req"),
        taskId: task.id,
        agentId: agent.id,
        status: "failed",
        result: {},
        inference: [],
        durationMs: Date.now() - started,
        attempts: 1,
        error: {
          code: error instanceof AppError ? error.code : "AGENT_ERROR",
          message: redact(errorMessage(error)),
          retryable: isTransient(error),
        },
      }
      this.trace(wf, { agentId: agent.id, taskId: task.id, action: "task.failed", status: "error", detail: result.error!.message, duration: result.durationMs })
      await this.persistResult(wf, task, agent.id as AgentId, result).catch((e) =>
        this.trace(wf, { agentId: agent.id, taskId: task.id, action: "arkiv.write", status: "error", detail: `Could not persist failure: ${errorMessage(e)}` }),
      )
      task.status = "failed"
      registry.activity(agent.id, `Failed ${task.type}: ${result.error!.code}`, "failed")
    } finally {
      registry.setStatus(agent.id, "idle")
    }
  }

  private async persistResult(wf: Workflow, task: WorkflowTask, agentId: AgentId, result: AgentResult) {
    const record: ExecutionRecord = {
      id: newId("exec"),
      workflowId: wf.id,
      taskId: task.id,
      agentId,
      status: result.status,
      inferenceRequestIds: result.inference.map((i) => i.requestId),
      inferenceProvider: result.inference[0]?.provider ?? "none",
      durationMs: result.durationMs,
      output: result.status === "success" ? result.result : { error: result.error },
      createdAt: nowIso(),
    }
    const msg = this.d.bus.create({
      workflowId: wf.id,
      taskId: task.id,
      correlationId: task.id,
      from: agentId,
      to: "supervisor",
      type: result.status === "success" ? "task.result" : "task.error",
      payload: { status: result.status, executionId: record.id, inferenceRequestIds: record.inferenceRequestIds },
    })
    const ref = await this.d.store.completeTask(task.arkivEntityKey!, record, msg)
    wf.results[task.id] = result
    task.resultEntityKey = ref.resultKey
    task.status = result.status === "success" ? "completed" : "failed"
    task.updatedAt = nowIso()
    wf.messages.push(msg)
    this.d.bus.publish(msg)
    this.trace(wf, {
      agentId,
      taskId: task.id,
      action: "arkiv.write",
      status: "ok",
      detail: `Execution record stored; task marked ${task.status}`,
      arkivEntityId: ref.resultKey,
      txHash: ref.txHash,
    })
    if (result.status === "success") {
      this.trace(wf, {
        agentId,
        taskId: task.id,
        action: "task.completed",
        status: "ok",
        detail: `${agentId} completed ${task.type} in ${result.durationMs}ms (${result.attempts} attempt${result.attempts > 1 ? "s" : ""})${result.result.llmFallback ? " · deterministic fallback used" : ""}`,
        duration: result.durationMs,
        inferenceRequestId: result.inference[0]?.requestId ?? null,
        arkivEntityId: ref.resultKey,
      })
    }
  }
}
