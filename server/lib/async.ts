import { randomUUID } from "node:crypto"
import { isTransient, TimeoutError } from "./errors"

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`
export const nowIso = () => new Date().toISOString()
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function withTimeout<T>(label: string, ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(label, ms))
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

export type RetryOptions = {
  retries: number
  baseDelayMs?: number
  onRetry?: (attempt: number, error: unknown) => void
}

/** Retries only transient failures; returns the value and how many attempts it took. */
export async function withRetry<T>(run: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<{ value: T; attempts: number }> {
  let attempt = 0
  for (;;) {
    attempt += 1
    try {
      return { value: await run(attempt), attempts: attempt }
    } catch (error) {
      if (attempt > opts.retries || !isTransient(error)) throw error
      opts.onRetry?.(attempt, error)
      await sleep((opts.baseDelayMs ?? 400) * 2 ** (attempt - 1))
    }
  }
}

/** Serialises async work — used so a single Arkiv signer never races its own nonce. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task)
    this.tail = next.catch(() => undefined)
    return next
  }
}

/** Extract the first JSON object from model output (handles ```json fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error("No JSON object in model output")
  return JSON.parse(candidate.slice(start, end + 1))
}
