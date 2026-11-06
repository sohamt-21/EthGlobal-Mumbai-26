import cors from "cors"
import express, { type Request } from "express"
import { z } from "zod"
import {
  AgentIdSchema,
  CapabilitySchema,
  CompleteTaskInputSchema,
  CreateTaskInputSchema,
  EntityKindSchema,
  ExecuteWorkflowInputSchema,
  RegisterAgentInputSchema,
  TaskStatusSchema,
  type IntegrationStatus,
  type RuntimeEvent,
  type Task,
} from "../../shared/schemas"
import { newId, nowIso } from "../lib/async"
import { AppError, forbidden, notFound, unauthorized } from "../lib/errors"
import type { Runtime } from "../runtime/container"
import { SAMPLE_CONTRACTS } from "../tools/samples"
import { bearer, errorHandler, hasAgentKey, ok, rateLimit } from "./middleware"

const param = (req: Request, name: string): string => String(req.params[name] ?? "")

export function createApp(rt: Runtime) {
  const app = express()
  app.disable("x-powered-by")
  app.set("trust proxy", "loopback")
  app.use(cors({ origin: rt.cfg.CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: false }))
  app.use(express.json({ limit: "128kb" }))
  app.use("/api", rateLimit("api", 600, 60_000))

  const session = (req: Request) => rt.identity.session(bearer(req))
  /** Worker-side task operations accept either the shared agent key or a verified human with task:write. */
  const requireWorker = (req: Request) => {
    if (hasAgentKey(req, rt.cfg.AGENT_API_KEY)) return { kind: "agent" as const }
    const identity = rt.identity.require(bearer(req), "task:write")
    return { kind: "human" as const, identity }
  }

  /* ───────────── health / status ───────────── */

  app.get("/api/health", (_req, res) => ok(res, { status: "ok", time: nowIso(), inference: rt.inference.mode, store: rt.store.mode, identity: rt.identity.mode }))

  let statusCache: { at: number; data: IntegrationStatus[] } | null = null
  app.get("/api/integrations/status", async (req, res) => {
    if (!statusCache || Date.now() - statusCache.at > 15_000 || req.query.refresh === "1") {
      const data = await Promise.all([rt.inference.status(), rt.store.status(), rt.identity.status()])
      data.push(
        { name: "ENS", mode: "disabled", connected: false, detail: "Agent ENS names are planned labels; no on-chain resolution in this build", meta: {}, checkedAt: nowIso() },
        { name: "Hedera x402", mode: "disabled", connected: false, detail: "Not implemented in this build (P2 stretch)", meta: {}, checkedAt: nowIso() },
      )
      statusCache = { at: Date.now(), data }
    }
    ok(res, statusCache.data)
  })

  app.get("/api/runtime/stats", (_req, res) => ok(res, rt.orchestrator.stats(rt.registry.list().length)))
  app.get("/api/inference/recent", (_req, res) => ok(res, rt.orchestrator.recentInference()))
  app.get("/api/samples", (_req, res) => ok(res, SAMPLE_CONTRACTS))

  /* ───────────── agents ───────────── */

  app.get("/api/agents", (_req, res) => ok(res, rt.registry.list()))
  app.get("/api/agents/:id", (req, res) => {
    const id = AgentIdSchema.safeParse(param(req, "id"))
    if (!id.success) throw notFound(`Agent ${param(req, "id")}`)
    ok(res, rt.registry.view(id.data))
  })
  app.post("/api/agents/register", rateLimit("register", 20, 60_000), async (req, res) => {
    const identity = rt.identity.require(bearer(req), "agent:register")
    const input = RegisterAgentInputSchema.parse(req.body)
    ok(res, await rt.registry.register(input, identity.subject), 201)
  })

  /* ───────────── tasks (coordination layer) ───────────── */

  app.get("/api/tasks", async (req, res) => {
    const q = z
      .object({
        workflowId: z.string().max(80).optional(),
        status: TaskStatusSchema.optional(),
        capability: CapabilitySchema.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query)
    ok(res, await rt.store.queryTasks(q))
  })

  app.get("/api/tasks/:key", async (req, res) => {
    const task = await rt.store.getTask(param(req, "key"))
    if (!task) throw notFound(`Task ${param(req, "key")}`)
    ok(res, task)
  })

  app.post("/api/tasks", rateLimit("tasks", 30, 60_000), async (req, res) => {
    const who = requireWorker(req)
    const input = CreateTaskInputSchema.parse(req.body)
    const now = nowIso()
    const task: Task = {
      id: newId("task"),
      workflowId: input.workflowId ?? newId("manual"),
      type: input.type,
      description: input.description,
      requiredCapability: input.requiredCapability,
      createdBy: who.kind === "human" ? `human:${who.identity.subject.slice(0, 16)}` : "external-agent",
      assignedAgent: null,
      claimedBy: null,
      status: "open",
      priority: input.priority,
      dependsOn: [],
      input: input.input,
      resultEntityKey: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + rt.cfg.ARKIV_TASK_TTL_HOURS * 3600_000).toISOString(),
    }
    const ref = await rt.store.createTasks([task], [])
    ok(res, { task, entityKey: ref.taskKeys[task.id], txHash: ref.txHash }, 201)
  })

  app.post("/api/tasks/:key/claim", rateLimit("claim", 60, 60_000), async (req, res) => {
    requireWorker(req)
    const { agentId } = z.object({ agentId: AgentIdSchema }).parse(req.body)
    const current = await rt.store.getTask(param(req, "key"))
    if (!current) throw notFound(`Task ${param(req, "key")}`)
    const agent = rt.registry.view(agentId)
    if (!agent.capabilities.includes(current.data.requiredCapability)) {
      throw forbidden(`Agent ${agentId} lacks capability ${current.data.requiredCapability}`)
    }
    const msg = rt.bus.create({ workflowId: current.data.workflowId, taskId: current.data.id, correlationId: current.data.id, from: agentId, to: "supervisor", type: "task.claimed", payload: { via: "api" } })
    ok(res, await rt.store.claimTask(param(req, "key"), agentId, msg))
  })

  app.post("/api/tasks/:key/complete", rateLimit("complete", 60, 60_000), async (req, res) => {
    requireWorker(req)
    const input = CompleteTaskInputSchema.parse(req.body)
    const current = await rt.store.getTask(param(req, "key"))
    if (!current) throw notFound(`Task ${param(req, "key")}`)
    if (current.data.claimedBy !== input.agentId) throw forbidden(`Task is claimed by ${current.data.claimedBy ?? "nobody"}, not ${input.agentId}`)
    if (!["claimed", "running"].includes(current.data.status)) throw new AppError("CONFLICT", `Task is ${current.data.status}`, 409)
    const ref = await rt.store.completeTask(
      param(req, "key"),
      {
        id: newId("exec"),
        workflowId: current.data.workflowId,
        taskId: current.data.id,
        agentId: input.agentId,
        status: input.status === "completed" ? "success" : "failed",
        inferenceRequestIds: input.inferenceRequestId ? [input.inferenceRequestId] : [],
        inferenceProvider: "external",
        durationMs: input.durationMs,
        output: input.output,
        createdAt: nowIso(),
      },
      null,
    )
    ok(res, ref)
  })

  /* ───────────── orchestration ───────────── */

  app.post("/api/orchestrator/execute", rateLimit("execute", 12, 60_000), async (req, res) => {
    const input = ExecuteWorkflowInputSchema.parse(req.body)
    const identity = session(req)
    if (rt.cfg.WORKFLOW_REQUIRES_HUMAN && !identity) {
      rt.identity.require(undefined, "workflow:execute")
    }
    const initiator = identity
      ? { subject: identity.subject, verified: true, provider: identity.verificationProvider }
      : { subject: "anonymous", verified: false, provider: "none" }
    if (req.query.wait === "true") return ok(res, await rt.orchestrator.execute(input, initiator), 201)
    ok(res, rt.orchestrator.start(input, initiator), 202)
  })

  app.get("/api/executions", (_req, res) => ok(res, rt.orchestrator.list()))
  app.get("/api/executions/:id", (req, res) => ok(res, rt.orchestrator.get(param(req, "id"))))
  app.get("/api/executions/:id/trace", (req, res) => ok(res, rt.orchestrator.get(param(req, "id")).trace))
  /** Execution history as stored in the coordination layer (not runtime memory). */
  app.get("/api/executions/:id/arkiv", async (req, res) => {
    const [executions, messages, tasks] = await Promise.all([
      rt.store.listExecutions({ workflowId: param(req, "id") }),
      rt.store.listMessages({ workflowId: param(req, "id") }),
      rt.store.queryTasks({ workflowId: param(req, "id") }),
    ])
    ok(res, { executions, messages, tasks })
  })

  /* ───────────── live events (SSE) ───────────── */

  app.get("/api/events", (req, res) => {
    const workflowId = typeof req.query.workflowId === "string" ? req.query.workflowId : null
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()
    res.write(`event: ready\ndata: {}\n\n`)
    const send = (e: RuntimeEvent) => {
      if (workflowId && e.workflowId !== workflowId) return
      res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    }
    const unsubscribe = rt.bus.subscribe(send)
    const ping = setInterval(() => res.write(`: ping\n\n`), 20_000)
    req.on("close", () => {
      clearInterval(ping)
      unsubscribe()
    })
  })

  /* ───────────── identity ───────────── */

  app.get("/api/identity/config", (_req, res) => ok(res, rt.identity.publicConfig()))
  app.post("/api/identity/rp-context", rateLimit("rp", 30, 60_000), (_req, res) => ok(res, rt.identity.rpContext()))
  app.post("/api/identity/verify", rateLimit("verify", 20, 60_000), async (req, res) => {
    const s = await rt.identity.verifyWorldId(req.body)
    ok(res, s)
  })
  app.post("/api/identity/dev-bypass", rateLimit("verify", 20, 60_000), async (_req, res) => ok(res, await rt.identity.devBypass()))
  app.get("/api/identity/status", (req, res) => {
    const identity = session(req)
    if (bearer(req) && !identity) throw unauthorized("Session expired or invalid")
    ok(res, { identity, mode: rt.identity.mode })
  })
  app.post("/api/identity/logout", (req, res) => {
    rt.identity.revoke(bearer(req))
    ok(res, { revoked: true })
  })
  app.get("/api/identity/events", (_req, res) => ok(res, rt.identity.events()))

  /* ───────────── Arkiv explorer ───────────── */

  app.get("/api/arkiv/explore", async (req, res) => {
    const q = z.object({ kind: EntityKindSchema, limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(req.query)
    ok(res, { mode: rt.store.mode, owner: rt.store.ownerAddress, entities: await rt.store.explore(q.kind, q.limit) })
  })

  app.use("/api", (_req, _res, next) => next(notFound("Endpoint")))
  app.use(errorHandler)
  return app
}
