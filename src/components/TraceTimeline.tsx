import { AlertTriangle, ArrowRightLeft, Brain, CheckCircle2, CircleDot, Database, GitBranch, Hand, Play, RotateCcw, SkipForward, Wrench, XCircle } from "lucide-react"
import { motion } from "motion/react"
import type { ExecutionTrace, TraceAction } from "../../shared/schemas"
import { useIntegration } from "@/lib/runtime"
import { AGENT_COLOR } from "./Shell"
import { clock, KeyChip } from "./common"

const ICON: Partial<Record<TraceAction, typeof Brain>> = {
  "workflow.started": Play,
  "plan.created": GitBranch,
  "plan.fallback": AlertTriangle,
  "task.created": Database,
  "task.claimed": Hand,
  "task.started": CircleDot,
  "task.retry": RotateCcw,
  "task.completed": CheckCircle2,
  "task.failed": XCircle,
  "task.skipped": SkipForward,
  "tool.invoked": Wrench,
  "inference.completed": Brain,
  "inference.failed": XCircle,
  "message.sent": ArrowRightLeft,
  "arkiv.write": Database,
  "arkiv.read": Database,
  "workflow.completed": CheckCircle2,
  "workflow.failed": XCircle,
}

export function TraceTimeline({ trace, compact = false }: { trace: ExecutionTrace[]; compact?: boolean }) {
  const arkiv = useIntegration("Arkiv")
  const explorer = typeof arkiv?.meta.explorer === "string" ? arkiv.meta.explorer : null
  return (
    <ol className="relative grid gap-0.5">
      {trace.map((t, i) => {
        const Icon = ICON[t.action] ?? CircleDot
        const color = t.status === "error" ? "var(--vx-red)" : t.action.startsWith("arkiv") || t.action === "task.created" ? "var(--vx-green)" : t.action.startsWith("inference") ? "var(--vx-violet)" : (AGENT_COLOR[t.agentId] ?? "var(--vx-blue)")
        return (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, delay: compact ? 0 : Math.min(i * 0.008, 0.2) }}
            className="relative grid grid-cols-[22px_1fr] gap-2.5 py-1.5"
          >
            {i < trace.length - 1 && <span className="absolute left-[10.5px] top-7 bottom-[-6px] w-px bg-white/[0.07]" />}
            <span className="mt-0.5 grid size-[22px] place-items-center rounded-full border border-white/[0.08] bg-[oklch(0.2_0.01_270)]" style={{ color }}>
              <Icon className="size-3" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                <span className="vx-mono text-[10px] text-muted-foreground">{clock(t.timestamp)}</span>
                <span className="vx-mono rounded px-1 text-[10px] uppercase tracking-wider" style={{ color: AGENT_COLOR[t.agentId], background: `color-mix(in oklch, ${AGENT_COLOR[t.agentId] ?? "white"} 12%, transparent)` }}>
                  {t.agentId}
                </span>
                <span className="vx-mono text-[10.5px] text-foreground/60">{t.action}</span>
                {t.duration != null && <span className="vx-mono text-[10px] text-muted-foreground">{t.duration}ms</span>}
              </div>
              <div className={t.status === "error" ? "text-[12.5px] text-red-200" : "text-[12.5px] text-foreground/85"}>{t.detail}</div>
              {!compact && (t.inferenceRequestId || t.arkivEntityId || t.txHash) && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {t.inferenceRequestId && <KeyChip label={t.inferenceRequestId.startsWith("mock_") ? "mock" : "0G"} value={t.inferenceRequestId} />}
                  {t.arkivEntityId && <KeyChip label={t.arkivEntityId.startsWith("local:") ? "local" : "entity"} value={t.arkivEntityId} />}
                  {t.txHash && <KeyChip label="tx" value={t.txHash} href={explorer ? `${explorer}/tx/${t.txHash}` : undefined} />}
                </div>
              )}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
