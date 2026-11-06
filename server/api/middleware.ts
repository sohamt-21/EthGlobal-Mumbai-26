import type { NextFunction, Request, Response } from "express"
import { timingSafeEqual } from "node:crypto"
import { ZodError } from "zod"
import type { ApiFailure, ApiSuccess } from "../../shared/schemas"
import { AppError, redact } from "../lib/errors"

export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ ok: true, data } satisfies ApiSuccess<T>)

export function bearer(req: Request): string | undefined {
  const h = req.header("authorization")
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : undefined
}

export function hasAgentKey(req: Request, expected: string | undefined): boolean {
  const got = req.header("x-agent-key")
  if (!expected || !got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Fixed-window in-memory rate limiter, keyed by client IP + bucket. */
export function rateLimit(bucket: string, limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>()
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${bucket}:${req.ip}`
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs })
      return next()
    }
    entry.count++
    if (entry.count > limit) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000))
      return next(new AppError("RATE_LIMITED", `Too many requests to ${bucket}; retry later`, 429))
    }
    next()
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  void _next
  let body: ApiFailure
  let status = 500
  if (err instanceof ZodError) {
    status = 400
    body = { ok: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }
  } else if (err instanceof AppError) {
    status = err.status
    body = { ok: false, error: { code: err.code, message: redact(err.message), details: err.details } }
  } else if (err instanceof SyntaxError && "body" in (err as object)) {
    status = 400
    body = { ok: false, error: { code: "INVALID_JSON", message: "Malformed JSON body" } }
  } else {
    console.error("[voxmesh] unhandled error", err)
    body = { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } }
  }
  res.status(status).json(body)
}
