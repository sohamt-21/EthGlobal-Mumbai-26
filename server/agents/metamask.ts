import { randomUUID } from "node:crypto"
import { access, mkdir } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { chromium, type Browser, type BrowserContext, type Page } from "playwright"
import type { Task } from "../../shared/schemas"
import type { AppConfig } from "../config"
import { AppError, errorMessage } from "../lib/errors"
import type { Agent, AgentContext, AgentOutput } from "../runtime/types"
import { parseSepoliaNativeTransfer, type SepoliaNativeTransfer } from "./wallet-transfer"

const SEPOLIA_CHAIN_ID = "0xaa36a7"

export function isMetaMaskConnectionPrompt(walletStage: string | null, promptText: string, expectedHost: string): boolean {
  const normalizedText = promptText.toLowerCase()
  return walletStage === "connecting" &&
    normalizedText.includes(expectedHost.toLowerCase()) &&
    (normalizedText.includes("review permissions") || normalizedText.includes("asking for your approval") || normalizedText.includes("wants to connect"))
}

async function handleMetaMaskConnectionPrompt(promptPage: Page, transferPage: Page, expectedHost: string, signal: AbortSignal) {
  if (!promptPage.url().startsWith("chrome-extension://")) return
  await promptPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => undefined)

  for (let attempt = 0; attempt < 1200 && !signal.aborted && !promptPage.isClosed(); attempt++) {
    const walletStage = await transferPage.locator("body").getAttribute("data-wallet-stage")
    const promptText = await promptPage.locator("body").innerText().catch(() => "")
    const normalizedText = promptText.toLowerCase()
    if (isMetaMaskConnectionPrompt(walletStage, promptText, expectedHost)) {
      const reviewButton = promptPage.getByRole("button", { name: /review permissions/i }).first()
      if (normalizedText.includes("review permissions") && await reviewButton.isVisible().catch(() => false)) {
        await reviewButton.click({ timeout: 1000 })
        continue
      }

      const confirmForThisButton = promptPage.getByRole("button", { name: /^confirm for this$/i }).first()
      if ((normalizedText.includes("review permissions") || normalizedText.includes("asking for your approval")) && await confirmForThisButton.isVisible().catch(() => false)) {
        await confirmForThisButton.click({ timeout: 1000 })
        continue
      }

      const isConnectionApproval = normalizedText.includes("asking for your approval") || normalizedText.includes("wants to connect")
      const connectButton = promptPage.getByRole("button", { name: /^connect$/i }).first()
      if (isConnectionApproval && await connectButton.isVisible().catch(() => false)) {
        await connectButton.click({ timeout: 1000 })
        continue
      }
    }
    await promptPage.waitForTimeout(250)
  }
}

function transferPageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VoxMesh Sepolia transfer</title>
    <style>
      body{font:16px system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 24px;color:#17211f;background:#f4f7f5}
      main{border:1px solid #ccd7d2;background:white;padding:28px;border-radius:8px}
      h1{font-size:24px;margin:0 0 18px}dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:12px}dt{color:#52625d}dd{margin:0;overflow-wrap:anywhere;font-family:ui-monospace,monospace}
      #status{margin-top:24px;padding:14px;background:#eef4f1;border-left:3px solid #31735d}
      p{line-height:1.5;color:#52625d}
    </style>
  </head>
  <body data-status="waiting"><main>
    <h1>Sepolia ETH transfer</h1>
    <dl><dt>Network</dt><dd>Sepolia</dd><dt>Amount</dt><dd id="amount"></dd><dt>Recipient</dt><dd id="recipient"></dd></dl>
    <div id="status" role="status">Waiting for MetaMask. Review the recipient and amount in MetaMask, then approve or reject there.</div>
    <p>This page cannot approve the transaction. Only MetaMask can sign it.</p>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const recipient = params.get("to");
    const amount = params.get("amount");
    const value = params.get("value");
    const status = document.getElementById("status");
    document.getElementById("recipient").textContent = recipient || "Invalid recipient";
    document.getElementById("amount").textContent = amount ? amount + " ETH" : "Invalid amount";
    async function requestTransfer() {
      try {
        if (!window.ethereum || !window.ethereum.isMetaMask) throw new Error("MetaMask was not detected. Check the extension setup.");
        let accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (!accounts || !accounts[0]) {
          document.body.dataset.walletStage = "connecting";
          accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        }
        if (!accounts || !accounts[0]) throw new Error("No MetaMask account is connected.");
        document.body.dataset.walletStage = "transaction";
        let activeChain = await window.ethereum.request({ method: "eth_chainId" });
        if (String(activeChain).toLowerCase() !== "${SEPOLIA_CHAIN_ID}") {
          status.textContent = "Requesting a switch to Sepolia in MetaMask...";
          try {
            await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "${SEPOLIA_CHAIN_ID}" }] });
          } catch (error) {
            if (!error || error.code !== 4902) throw error;
            status.textContent = "Requesting that MetaMask add Sepolia...";
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "${SEPOLIA_CHAIN_ID}",
                chainName: "Sepolia",
                nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://rpc.sepolia.org"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              }],
            });
          }
          activeChain = await window.ethereum.request({ method: "eth_chainId" });
          if (String(activeChain).toLowerCase() !== "${SEPOLIA_CHAIN_ID}") throw new Error("MetaMask did not switch to Sepolia.");
        }
        status.textContent = "Review the recipient and amount, then approve the transaction in MetaMask.";
        const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: recipient, value }] });
        document.body.dataset.status = "submitted";
        status.textContent = "Submitted to Sepolia. Transaction hash: " + hash;
      } catch (error) {
        document.body.dataset.status = "failed";
        status.textContent = error && error.code === 4001 ? "Rejected in MetaMask. No transaction was submitted." : (error && error.message) || "The wallet request failed.";
      }
    }
    void requestTransfer();
  </script></body>
</html>`
}

async function serveTransferPage(transfer: SepoliaNativeTransfer): Promise<{ url: string; close(): Promise<void> }> {
  const routeId = randomUUID()
  const value = `0x${BigInt(transfer.amountWei).toString(16)}`
  let served = false
  const server: Server = createServer((request, response) => {
    const requested = new URL(request.url ?? "/", "http://127.0.0.1")
    if (
      !served &&
      requested.pathname === `/${routeId}` &&
      requested.searchParams.get("to") === transfer.recipient &&
      requested.searchParams.get("amount") === transfer.amountEth &&
      requested.searchParams.get("value") === value
    ) {
      served = true
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
      response.end(transferPageHtml())
      return
    }
    response.writeHead(404).end()
  })

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new AppError("METAMASK_PAGE_FAILED", "Could not start the local transfer page.", 500)
  return {
    url: `http://127.0.0.1:${address.port}/${routeId}?to=${encodeURIComponent(transfer.recipient)}&amount=${encodeURIComponent(transfer.amountEth)}&value=${value}`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  }
}

export class MetaMaskAgent implements Agent {
  readonly id = "metamask" as const
  readonly name = "MetaMask"
  readonly description = "Opens a visible browser to request a validated Sepolia native ETH transfer; the user approves or rejects it in MetaMask."
  readonly capabilities = ["wallet_transfer" as const]

  constructor(private readonly config: AppConfig) {}

  private async connectToChrome(endpoint: string): Promise<{ browser: Browser; context: BrowserContext }> {
    const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
    const context = browser.contexts()[0]
    if (!context) {
      await browser.close().catch(() => undefined)
      throw new AppError("METAMASK_BROWSER_UNAVAILABLE", "The Chrome debugging endpoint has no browser context.", 503)
    }
    return { browser, context }
  }

  async execute(task: Task, context: AgentContext): Promise<AgentOutput> {
    const transfer = parseSepoliaNativeTransfer(context.command)
    if (!transfer) throw new AppError("INVALID_TRANSFER", "A valid Sepolia ETH transfer request is required.", 400)

    const cdpEndpoint = this.config.METAMASK_CDP_ENDPOINT
    let extensionPath: string | undefined
    let profilePath: string | undefined
    if (!cdpEndpoint) {
      const extensionSetting = this.config.METAMASK_EXTENSION_PATH
      if (!extensionSetting) {
        throw new AppError("METAMASK_NOT_CONFIGURED", "Set METAMASK_CDP_ENDPOINT to attach to Chrome, or METAMASK_EXTENSION_PATH to use Playwright Chromium.", 503)
      }
      extensionPath = resolve(extensionSetting)
      try {
        await access(join(extensionPath, "manifest.json"))
      } catch {
        throw new AppError("METAMASK_NOT_CONFIGURED", `No extension manifest found at ${extensionPath}.`, 503)
      }
      profilePath = this.config.METAMASK_PROFILE_PATH
        ? resolve(this.config.METAMASK_PROFILE_PATH)
        : join(homedir(), ".voxmesh", "metamask-profile")
      await mkdir(profilePath, { recursive: true, mode: 0o700 })
    }

    context.trace({
      agentId: this.id,
      taskId: task.id,
      action: "tool.invoked",
      status: "info",
      detail: `${cdpEndpoint ? "Using the attached Chrome window" : "Opening a visible Playwright Chromium window"} for ${transfer.amountEth} Sepolia ETH to ${transfer.recipient}; confirmation is required in MetaMask.`,
      data: { network: "Sepolia", recipient: transfer.recipient, amountEth: transfer.amountEth },
    })

    let browserContext: BrowserContext | undefined
    let attachedBrowser: Browser | undefined
    let page: Page | undefined
    let connectionPromptHandler: ((popup: Page) => void) | undefined
    let transferServer: Awaited<ReturnType<typeof serveTransferPage>> | undefined
    const closeBrowser = () => {
      if (cdpEndpoint) void page?.close().catch(() => undefined)
      else void browserContext?.close().catch(() => undefined)
    }
    try {
      if (cdpEndpoint) {
        const attached = await this.connectToChrome(cdpEndpoint)
        attachedBrowser = attached.browser
        browserContext = attached.context
      } else {
        browserContext = await chromium.launchPersistentContext(profilePath!, {
            channel: "chromium",
            headless: false,
            viewport: null,
            args: [`--disable-extensions-except=${extensionPath!}`, `--load-extension=${extensionPath!}`],
          })
      }
      if (context.signal.aborted) throw new AppError("WALLET_REQUEST_ABORTED", "The wallet request was cancelled.", 408)
      context.signal.addEventListener("abort", closeBrowser, { once: true })
      transferServer = await serveTransferPage(transfer)
      page = await browserContext.newPage()
      const expectedHost = new URL(transferServer.url).host
      connectionPromptHandler = (popup) => {
        if (popup === page || !popup.url().startsWith("chrome-extension://")) return
        void handleMetaMaskConnectionPrompt(popup, page!, expectedHost, context.signal).catch(async (error) => {
          if (context.signal.aborted) return
          const detail = `MetaMask connection permission automation failed: ${errorMessage(error)}`
          context.trace({ agentId: this.id, taskId: task.id, action: "tool.invoked", status: "error", detail })
          await page?.evaluate((message) => {
            if (document.body.dataset.walletStage === "connecting") {
              document.body.dataset.status = "failed"
              const status = document.getElementById("status")
              if (status) status.textContent = message
            }
          }, detail).catch(() => undefined)
        })
      }
      browserContext.on("page", connectionPromptHandler)
      await page.goto(transferServer.url)
      await page.waitForFunction(
        () => document.body.dataset.status === "submitted" || document.body.dataset.status === "failed",
        null,
        { timeout: 0 },
      )
      const status = await page.locator("body").getAttribute("data-status")
      if (status !== "submitted") {
        const message = await page.locator("#status").textContent()
        throw new AppError("WALLET_REQUEST_FAILED", message || "MetaMask did not submit the transaction.", 400)
      }
      const pageText = await page.locator("#status").textContent()
      const transactionHash = pageText?.match(/0x[a-fA-F0-9]{64}/)?.[0]
      if (!transactionHash) throw new AppError("WALLET_REQUEST_FAILED", "MetaMask returned no transaction hash.", 502)

      return {
        result: {
          network: "Sepolia",
          recipient: transfer.recipient,
          amountEth: transfer.amountEth,
          status: "submitted",
          transactionHash,
          confirmation: "approved in MetaMask by the user",
        },
        inference: [],
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError("METAMASK_BROWSER_FAILED", `MetaMask browser request failed: ${errorMessage(error)}`, 502)
    } finally {
      context.signal.removeEventListener("abort", closeBrowser)
      if (connectionPromptHandler) browserContext?.off("page", connectionPromptHandler)
      if (cdpEndpoint) await page?.close().catch(() => undefined)
      else await browserContext?.close().catch(() => undefined)
      await attachedBrowser?.close().catch(() => undefined)
      await transferServer?.close()
    }
  }
}