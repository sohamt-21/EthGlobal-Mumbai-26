export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class TimeoutError extends AppError {
  constructor(label: string, ms: number) {
    super("TIMEOUT", `${label} timed out after ${ms}ms`, 504, undefined, true)
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`, 404)
export const forbidden = (message: string) => new AppError("FORBIDDEN", message, 403)
export const unauthorized = (message: string) => new AppError("UNAUTHORIZED", message, 401)
export const conflict = (message: string) => new AppError("CONFLICT", message, 409)

/** Transient = worth retrying: timeouts, rate limits, 5xx, socket errors. */
export function isTransient(error: unknown): boolean {
  if (error instanceof AppError) return error.retryable
  if (!(error instanceof Error)) return false
  const status = (error as { status?: unknown }).status
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network/i.test(error.message)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Strip anything that looks like a secret before it reaches logs, traces or the client. */
export function redact(text: string): string {
  return text
    .replace(/0x[a-fA-F0-9]{64}/g, "0x[redacted-key]")
    .replace(/(sk-|Bearer\s+)[A-Za-z0-9._-]{8,}/g, "$1[redacted]")
}
