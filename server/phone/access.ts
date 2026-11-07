import { randomBytes, timingSafeEqual, X509Certificate } from "node:crypto"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { networkInterfaces, homedir } from "node:os"
import { join } from "node:path"
import express, { type NextFunction, type Request, type Response } from "express"
import QRCode from "qrcode"
import { generate } from "selfsigned"
import { ExecuteWorkflowInputSchema } from "../../shared/schemas"
import type { AppConfig } from "../config"
import { AppError, unauthorized } from "../lib/errors"
import type { Runtime } from "../runtime/container"
import { errorHandler, ok, rateLimit } from "../api/middleware"
import { phonePageHtml } from "./page"

/**
 * Phone access: a separate HTTPS listener on the LAN that serves one mobile page and a small
 * allowlist of API routes, all gated by a pairing token. The main API stays on loopback.
 */

export const PHONE_TOKEN_HEADER = "x-voxmesh-pair"

export type PairingInfo = {
  enabled: boolean
  url: string | null
  urls: string[]
  qrSvg: string | null
  certFingerprint: string | null
  port: number
}

type CertMeta = { ips: string[] }

export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net): net is NonNullable<typeof net> => Boolean(net) && net!.family === "IPv4" && !net!.internal)
    .map((net) => net.address)
}

export function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"
}

function tokensEqual(got: string | undefined, expected: string): boolean {
  if (!got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export class PhoneAccess {
  private token = ""
  private cert = ""
  private key = ""
  private ips: string[] = []

  private constructor(
    readonly dir: string,
    readonly port: number,
  ) {}

  static async load(cfg: AppConfig, ips: string[] = lanAddresses()): Promise<PhoneAccess> {
    const access = new PhoneAccess(cfg.PHONE_STATE_DIR ?? join(homedir(), ".voxmesh", "phone"), cfg.PHONE_HTTPS_PORT)
    await access.init(ips)
    return access
  }

  private async init(ips: string[]) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    this.ips = ips
    this.token = (await readFile(join(this.dir, "pairing-token"), "utf8").catch(() => "")).trim()
    if (!/^[A-Za-z0-9_-]{43}$/.test(this.token)) await this.rotate()

    const meta = JSON.parse(await readFile(join(this.dir, "cert-meta.json"), "utf8").catch(() => "{}")) as Partial<CertMeta>
    const cert = await readFile(join(this.dir, "cert.pem"), "utf8").catch(() => "")
    const key = await readFile(join(this.dir, "key.pem"), "utf8").catch(() => "")
    const sameIps = JSON.stringify([...(meta.ips ?? [])].sort()) === JSON.stringify([...ips].sort())
    const valid = cert && key && sameIps && new X509Certificate(cert).validToDate.getTime() > Date.now() + 7 * 86_400_000
    if (valid) {
      this.cert = cert
      this.key = key
      return
    }
    // A new certificate is issued when the laptop's LAN address changes, so the phone sees one warning per network.
    const pems = await generate([{ name: "commonName", value: "VoxMesh phone access" }], {
      keyType: "ec",
      curve: "P-256",
      algorithm: "sha256",
      notAfterDate: new Date(Date.now() + 397 * 86_400_000),
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }, ...ips.map((ip) => ({ type: 7 as const, ip }))] },
      ],
    })
    this.cert = pems.cert
    this.key = pems.private
    await writeFile(join(this.dir, "cert.pem"), this.cert, { mode: 0o600 })
    await writeFile(join(this.dir, "key.pem"), this.key, { mode: 0o600 })
    await writeFile(join(this.dir, "cert-meta.json"), JSON.stringify({ ips } satisfies CertMeta), { mode: 0o600 })
  }

  /** Invalidates every paired phone. */
  async rotate(): Promise<void> {
    this.token = randomBytes(32).toString("base64url")
    const file = join(this.dir, "pairing-token")
    await writeFile(file, this.token, { mode: 0o600 })
    await chmod(file, 0o600)
  }

  tls() {
    return { cert: this.cert, key: this.key }
  }

  verify(token: string | undefined): boolean {
    return tokensEqual(token, this.token)
  }

  async pairing(): Promise<PairingInfo> {
    const urls = this.ips.map((ip) => `https://${ip}:${this.port}/phone`)
    // The token travels in the URL fragment, which browsers never send to the server or log.
    const url = urls[0] ? `${urls[0]}#pair=${this.token}` : null
    return {
      enabled: true,
      url,
      urls,
      qrSvg: url ? await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null,
      certFingerprint: new X509Certificate(this.cert).fingerprint256,
      port: this.port,
    }
  }
}

/** Express app for the LAN listener. Only the routes below exist; everything under /api needs the pairing token. */
export function createPhoneApp(rt: Runtime, access: PhoneAccess) {
  const app = express()
  app.disable("x-powered-by")
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Strict-Transport-Security", "max-age=86400")
    next()
  })
  app.use(express.json({ limit: "32kb" }))

  app.get(["/", "/phone"], (_req, res) => {
    res.setHeader("Cache-Control", "no-store")
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
    res.type("html").send(phonePageHtml())
  })

  app.use("/api", rateLimit("phone-auth", 120, 60_000), (req: Request, _res: Response, next: NextFunction) => {
    if (!access.verify(req.header(PHONE_TOKEN_HEADER))) return next(unauthorized("This phone is not paired. Scan the pairing QR code on the laptop."))
    next()
  })

  app.get("/api/health", (_req, res) => ok(res, { status: "ok", paired: true, workflowRequiresHuman: rt.cfg.WORKFLOW_REQUIRES_HUMAN }))
  app.get("/api/samples", (_req, res) => ok(res, rt.tools.invoke("supervisor", "samples.list", undefined as never)))
  app.post("/api/orchestrator/execute", rateLimit("phone-execute", 12, 60_000), (req, res) => {
    if (rt.cfg.WORKFLOW_REQUIRES_HUMAN) {
      throw new AppError("HUMAN_REQUIRED", "This server requires a World ID-verified human to start workflows. Start it from the laptop.", 403)
    }
    const input = ExecuteWorkflowInputSchema.pick({ command: true, channel: true, sampleContractId: true }).parse(req.body)
    ok(res, rt.orchestrator.start(input, { subject: "paired-phone", verified: false, provider: "phone-pairing" }), 202)
  })
  app.get("/api/executions/:id", (req, res) => ok(res, rt.orchestrator.get(String(req.params.id))))

  app.use((_req, _res, next) => next(new AppError("NOT_FOUND", "Not available on the phone listener", 404)))
  app.use(errorHandler)
  return app
}
