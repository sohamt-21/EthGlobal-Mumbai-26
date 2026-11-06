import { createHash, randomBytes } from "node:crypto"
import { signRequest } from "@worldcoin/idkit/signing"
import { z } from "zod"
import type { Identity, IdentityEvent, IntegrationStatus, Permission } from "../../../shared/schemas"
import type { AppConfig } from "../../config"
import { newId, nowIso } from "../../lib/async"
import { AppError, errorMessage, forbidden, redact, unauthorized } from "../../lib/errors"
import type { CoordinationStore } from "../store/types"

/** Minimal structural check of an IDKit v3/v4 result. The payload is forwarded to World unchanged. */
const IdkitResultSchema = z
  .object({
    protocol_version: z.string(),
    nonce: z.string(),
    action: z.string().optional(),
    environment: z.string().optional(),
    responses: z
      .array(z.object({ identifier: z.string(), nullifier: z.string() }).passthrough())
      .min(1),
  })
  .passthrough()

const VerifyResponseSchema = z
  .object({ success: z.boolean().optional(), code: z.string().optional(), detail: z.string().optional() })
  .passthrough()

const VERIFIED_PERMISSIONS: Permission[] = ["workflow:execute", "agent:register", "agent:delegate", "task:write"]

export type Session = { token: string; identity: Identity }

export class IdentityService {
  private readonly sessions = new Map<string, Identity>()
  private readonly issuedNonces = new Map<string, number>()
  private readonly usedNonces = new Set<string>()
  private readonly log: IdentityEvent[] = []

  constructor(
    private readonly cfg: AppConfig,
    private readonly store: CoordinationStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get worldConfigured(): boolean {
    return Boolean(this.cfg.WORLD_APP_ID && this.cfg.WORLD_RP_ID && this.cfg.WORLD_RP_SIGNING_KEY)
  }

  get mode(): "live" | "dev-bypass" | "disabled" {
    if (this.worldConfigured) return "live"
    return this.cfg.WORLD_ID_DEV_BYPASS ? "dev-bypass" : "disabled"
  }

  private event(type: IdentityEvent["type"], detail: string, subject: string | null = null) {
    this.log.unshift({ id: newId("idev"), type, detail, subject, timestamp: nowIso() })
    this.log.length = Math.min(this.log.length, 200)
  }

  events(): IdentityEvent[] {
    return this.log
  }

  publicConfig() {
    return {
      mode: this.mode,
      appId: this.cfg.WORLD_APP_ID ?? null,
      rpId: this.cfg.WORLD_RP_ID ?? null,
      action: this.cfg.WORLD_ACTION,
      environment: this.cfg.WORLD_ENVIRONMENT,
      devBypassEnabled: this.cfg.WORLD_ID_DEV_BYPASS && !this.worldConfigured,
      workflowRequiresHuman: this.cfg.WORKFLOW_REQUIRES_HUMAN,
    }
  }

  /** RP signature for IDKit `rp_context`. The signing key never leaves the server. */
  rpContext() {
    if (!this.worldConfigured) throw new AppError("WORLD_ID_NOT_CONFIGURED", "World ID is not configured on this server", 503)
    const sig = signRequest({ signingKeyHex: this.cfg.WORLD_RP_SIGNING_KEY!, action: this.cfg.WORLD_ACTION })
    this.issuedNonces.set(sig.nonce, sig.expiresAt)
    this.event("rp.signed", `Issued RP signature nonce ${sig.nonce.slice(0, 10)}…`)
    return {
      rp_id: this.cfg.WORLD_RP_ID!,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    }
  }

  async verifyWorldId(payload: unknown): Promise<Session> {
    if (!this.worldConfigured) throw new AppError("WORLD_ID_NOT_CONFIGURED", "World ID is not configured on this server", 503)
    const parsed = IdkitResultSchema.safeParse(payload)
    if (!parsed.success) {
      this.event("verify.failed", "Malformed IDKit result")
      throw new AppError("INVALID_PROOF", "Malformed IDKit result", 400, parsed.error.issues.slice(0, 3))
    }
    const result = parsed.data
    const issuedExpiry = this.issuedNonces.get(result.nonce)
    if (issuedExpiry === undefined || this.usedNonces.has(result.nonce)) {
      this.event("verify.failed", "Proof nonce was not issued by this server or was already used")
      throw new AppError("INVALID_NONCE", "Proof nonce was not issued by this server or was already used", 400)
    }
    if (issuedExpiry * 1000 < Date.now()) {
      this.event("verify.failed", "RP signature expired before verification")
      throw new AppError("PROOF_EXPIRED", "The verification request expired. Start again.", 400)
    }
    if (result.action && result.action !== this.cfg.WORLD_ACTION) {
      this.event("verify.failed", `Unexpected action ${result.action}`)
      throw new AppError("INVALID_PROOF", "Proof was generated for a different action", 400)
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.cfg.WORLD_VERIFY_BASE_URL.replace(/\/$/, "")}/${this.cfg.WORLD_RP_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      this.event("verify.failed", `World verify unreachable: ${redact(errorMessage(error))}`)
      throw new AppError("WORLD_ID_UNREACHABLE", "Could not reach the World ID verification service", 502, undefined, true)
    }
    const body = VerifyResponseSchema.safeParse(await res.json().catch(() => ({})))
    const success = res.ok && body.success && body.data.success === true
    this.usedNonces.add(result.nonce)
    this.issuedNonces.delete(result.nonce)
    if (!success) {
      const code = body.success ? body.data.code ?? `http_${res.status}` : `http_${res.status}`
      this.event("verify.failed", `World ID rejected proof (${code})`)
      throw new AppError("VERIFICATION_REJECTED", `World ID rejected the proof (${code})`, 401, { code })
    }

    const nullifier = result.responses[0].nullifier
    const subject = createHash("sha256").update(`${this.cfg.WORLD_ACTION}:${nullifier}`).digest("hex")
    return this.openSession(subject, "world-id", result.responses[0].identifier, result.environment ?? this.cfg.WORLD_ENVIRONMENT)
  }

  /** DEV ONLY. Refused unless WORLD_ID_DEV_BYPASS=true and real World ID is not configured. */
  async devBypass(): Promise<Session> {
    if (this.mode !== "dev-bypass") throw forbidden("Development bypass is disabled")
    const subject = createHash("sha256").update(`dev-bypass:${randomBytes(8).toString("hex")}`).digest("hex")
    return this.openSession(subject, "dev-bypass", null, "development")
  }

  private async openSession(
    subject: string,
    provider: Identity["verificationProvider"],
    credential: string | null,
    environment: string,
  ): Promise<Session> {
    const verifiedAt = nowIso()
    const expiresAt = new Date(Date.now() + this.cfg.IDENTITY_SESSION_TTL_MINUTES * 60_000).toISOString()
    let arkivEntityKey: string | null = null
    try {
      const ref = await this.store.recordIdentity({ subject, provider, verifiedAt, permissions: VERIFIED_PERMISSIONS, environment })
      arkivEntityKey = ref.key
    } catch (error) {
      this.event("verify.success", `Identity attestation not persisted: ${redact(errorMessage(error))}`, subject)
    }
    const identity: Identity = {
      id: newId("idn"),
      subject,
      verificationProvider: provider,
      verificationStatus: "verified",
      verifiedAt,
      expiresAt,
      permissions: VERIFIED_PERMISSIONS,
      credential,
      environment,
      arkivEntityKey,
    }
    const token = randomBytes(32).toString("base64url")
    this.sessions.set(token, identity)
    this.event(
      "verify.success",
      provider === "dev-bypass" ? "DEV BYPASS session opened — not a World ID verification" : `World ID verified (${credential ?? "credential"})`,
      subject,
    )
    return { token, identity }
  }

  session(token: string | undefined): Identity | null {
    if (!token) return null
    const identity = this.sessions.get(token)
    if (!identity) return null
    if (Date.parse(identity.expiresAt) < Date.now()) {
      this.sessions.delete(token)
      this.event("session.expired", "Verification session expired", identity.subject)
      return null
    }
    return identity
  }

  require(token: string | undefined, permission: Permission): Identity {
    const identity = this.session(token)
    if (!identity) {
      this.event("permission.denied", `Missing verified human for ${permission}`)
      throw unauthorized(`A verified human (World ID) is required for ${permission}`)
    }
    if (!identity.permissions.includes(permission)) {
      this.event("permission.denied", `Identity lacks ${permission}`, identity.subject)
      throw forbidden(`Identity lacks permission ${permission}`)
    }
    return identity
  }

  revoke(token: string | undefined) {
    if (token) this.sessions.delete(token)
  }

  activeSessions(): number {
    return [...this.sessions.values()].filter((i) => Date.parse(i.expiresAt) > Date.now()).length
  }

  async status(): Promise<IntegrationStatus> {
    const mode = this.mode
    return {
      name: "World ID",
      mode: mode === "live" ? "live" : mode === "dev-bypass" ? "dev-bypass" : "disabled",
      connected: mode === "live",
      detail:
        mode === "live"
          ? `IDKit v4 configured for action "${this.cfg.WORLD_ACTION}" (${this.cfg.WORLD_ENVIRONMENT})`
          : mode === "dev-bypass"
            ? "DEV BYPASS enabled — sessions are NOT World ID verifications"
            : "World ID not configured (WORLD_APP_ID / WORLD_RP_ID / WORLD_RP_SIGNING_KEY)",
      meta: {
        appId: this.cfg.WORLD_APP_ID ?? null,
        rpId: this.cfg.WORLD_RP_ID ?? null,
        action: this.cfg.WORLD_ACTION,
        environment: this.cfg.WORLD_ENVIRONMENT,
        activeSessions: this.activeSessions(),
      },
      checkedAt: nowIso(),
    }
  }
}
