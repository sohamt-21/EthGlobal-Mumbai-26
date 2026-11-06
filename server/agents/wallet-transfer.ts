import { getAddress, isAddress, parseEther } from "viem"
import { AppError } from "../lib/errors"

export type SepoliaNativeTransfer = {
  recipient: `0x${string}`
  amountEth: string
  amountWei: string
  chainId: 11155111
}

export function isNativeTransferIntent(command: string): boolean {
  return /\b(?:send|transfer)\b/i.test(command) && /\b(?:eth|ether)\b/i.test(command)
}

export function parseSepoliaNativeTransfer(command: string): SepoliaNativeTransfer | null {
  if (!isNativeTransferIntent(command)) return null

  const match = command.match(/\b(?:send|transfer)\s+([0-9]+(?:\.[0-9]{1,18})?)\s+sepolia\s+(?:eth|ether)\s+to\s+(?:(?:(?:this|the)\s+)?address\s+)?(0x[a-fA-F0-9]{40})\b/i)
  if (!match) {
    throw new AppError(
      "INVALID_TRANSFER",
      "For safety, specify a positive ETH amount, the Sepolia network, and one complete 0x recipient address.",
      400,
    )
  }

  const [, amountEth, recipientInput] = match
  if (!isAddress(recipientInput, { strict: false })) {
    throw new AppError("INVALID_TRANSFER", "The recipient is not a valid Ethereum address.", 400)
  }

  let amountWei: bigint
  try {
    amountWei = parseEther(amountEth)
  } catch {
    throw new AppError("INVALID_TRANSFER", "The ETH amount is invalid.", 400)
  }
  if (amountWei <= 0n) {
    throw new AppError("INVALID_TRANSFER", "The ETH amount must be greater than zero.", 400)
  }

  return {
    recipient: getAddress(recipientInput.toLowerCase()),
    amountEth,
    amountWei: amountWei.toString(),
    chainId: 11155111,
  }
}