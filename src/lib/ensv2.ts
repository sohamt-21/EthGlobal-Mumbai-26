import {
  concat,
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  encodeFunctionData,
  getCreate2Address,
  isAddress,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem"
import { mainnet, sepolia } from "viem/chains"
import { normalize, packetToBytes } from "viem/ens"

export type EnsChainId = 1 | 11155111
export type EnsAgent = {
  id: string
  name: string
  description: string
  capabilities: string[]
  endpoint: string
}

const DEPLOYMENTS: Record<EnsChainId, { helper: Address; factory: Address; registryImpl: Address; resolverImpl: Address }> = {
  1: {
    helper: "0x46ae127d14683ac74ef151e46ae2117a1a25c676",
    factory: "0x77510ba162dfea3d8989e3f0928a691b345730d2",
    registryImpl: "0xfaa23592aca10a6d8875b18ea86954e8eb6d8d72",
    resolverImpl: "0x565b0f456a04ac9b48758190e90030623cff57c5",
  },
  11155111: {
    helper: "0xd453e5bdb62cc3bea84341b1e306319c8ffd7dfe",
    factory: "0xda70306c98e97ece36f997a21368e53298572991",
    registryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
    resolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  },
}

const FACTORY_ABI = parseAbi([
  "function proxyLogic() view returns (address)",
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)",
])

const HELPER_ABI = parseAbi([
  "function findExactRegistry(bytes name) view returns (address)",
  "function findParentRegistry(bytes name) view returns (address)",
])

const REGISTRY_ABI = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId)",
  "function setParent(address parent, string label)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function findOwner(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
])

const RESOLVER_ABI = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function grantSetterRoles(bytes setter, address account)",
  "function multicall(bytes[] calls)",
])

const ALL_ROLES = BigInt(`0x${"1".repeat(64)}`)
const ROLE_REGISTRAR = 1n
const ROLE_SET_SUBREGISTRY = 1n << 20n
const ROLE_CAN_TRANSFER_ADMIN = 1n << 156n
const MAX_UINT64 = (1n << 64n) - 1n
const ZERO_ADDRESS = zeroAddress.toLowerCase()

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
  }
}

export function buildEnsAgentHierarchy(parentName: string, agents: Pick<EnsAgent, "id">[]) {
  const parent = normalize(parentName).toLowerCase()
  if (!parent.endsWith(".eth") || parent.split(".").length < 2) {
    throw new Error("Enter a registered ENSv2 .eth name that you own")
  }
  const ids = agents.map((agent) => agent.id)
  if (new Set(ids).size !== ids.length || !ids.includes("supervisor")) {
    throw new Error("Agent IDs must be unique and include supervisor")
  }
  const namespaceName = `voxmesh.${parent}`
  const supervisorName = `supervisor.${namespaceName}`
  const agentNames = Object.fromEntries(
    agents.map((agent) => [agent.id, agent.id === "supervisor" ? supervisorName : `${agent.id}.${supervisorName}`]),
  )
  return { parentName: parent, namespaceName, supervisorName, agentNames }
}

export function agentTextKey(agentId: string, field: string) {
  if (!/^[a-z0-9-]+$/.test(agentId) || !/^[a-z0-9-]+$/.test(field)) throw new Error("Invalid ENS text key")
  return `voxmesh.agent.${agentId}.${field}`
}

export function agentTransferRole(transferable: boolean) {
  return transferable ? ALL_ROLES : ALL_ROLES & ~ROLE_CAN_TRANSFER_ADMIN
}

function dnsName(name: string): Hex {
  return toHex(packetToBytes(normalize(name)))
}

function labelId(label: string) {
  return BigInt(keccak256(stringToHex(label)))
}

function registrySalt(name: string) {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(stringToHex("UserRegistry")), namehash(name), 0n],
      ),
    ),
  )
}

function resolverSalt(account: Address) {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToHex("OwnedResolver")), account, 0n],
      ),
    ),
  )
}

function injectedProvider() {
  if (!window.ethereum) throw new Error("No injected wallet found. Install MetaMask to use ENSv2.")
  return window.ethereum as Parameters<typeof custom>[0]
}

async function clients(chainId: EnsChainId) {
  const provider = injectedProvider()
  const chain = chainId === 1 ? mainnet : sepolia
  const transport = custom(provider)
  const publicClient = createPublicClient({ chain, transport })
  const walletClient = createWalletClient({ chain, transport })
  const actualChainId = Number(await provider.request({ method: "eth_chainId" }))
  if (actualChainId !== chainId) {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] })
  }
  const [account] = await walletClient.requestAddresses()
  if (!account) throw new Error("No wallet account selected")
  return { account, publicClient, walletClient, deployment: DEPLOYMENTS[chainId] }
}

async function ensureProxy(
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"],
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"],
  account: Address,
  factory: Address,
  implementation: Address,
  salt: bigint,
  initializer: Hex,
) {
  const proxyLogic = await publicClient.readContract({ address: factory, abi: FACTORY_ABI, functionName: "proxyLogic" })
  const outerSalt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [account, salt]))
  const initCode = concat([
    "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
    proxyLogic,
    "0x5af43d82803e903d91602b57fd5bf3",
    outerSalt,
  ])
  const address = getCreate2Address({ from: factory, salt: outerSalt, bytecodeHash: keccak256(initCode) })
  if (!(await publicClient.getBytecode({ address }))) {
    const hash = await walletClient.writeContract({
      account,
      address: factory,
      abi: FACTORY_ABI,
      functionName: "deployProxy",
      args: [implementation, salt, initializer],
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }
  return address
}

export async function connectEnsWallet(chainId: EnsChainId) {
  const { account } = await clients(chainId)
  return account
}

export async function syncEnsAgentHierarchy(
  chainId: EnsChainId,
  parentName: string,
  agents: EnsAgent[],
  options: { expiry: "year" | "forever"; transferable: boolean },
) {
  const hierarchy = buildEnsAgentHierarchy(parentName, agents)
  const { account, publicClient, walletClient, deployment } = await clients(chainId)
  const helper = deployment.helper

  const registryInitializer = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "initialize",
    args: [[{ account, roleBitmap: ALL_ROLES }]],
  })
  const resolverInitializer = encodeFunctionData({
    abi: RESOLVER_ABI,
    functionName: "initialize",
    args: [[{ account, roleBitmap: ALL_ROLES }], []],
  })
  const ensureRegistry = (name: string) =>
    ensureProxy(publicClient, walletClient, account, deployment.factory, deployment.registryImpl, registrySalt(name), registryInitializer)

  let parentChildrenRegistry = await publicClient.readContract({
    address: helper,
    abi: HELPER_ABI,
    functionName: "findExactRegistry",
    args: [dnsName(hierarchy.parentName)],
  })
  if (parentChildrenRegistry.toLowerCase() === ZERO_ADDRESS) {
    const parentEntryRegistry = await publicClient.readContract({
      address: helper,
      abi: HELPER_ABI,
      functionName: "findParentRegistry",
      args: [dnsName(hierarchy.parentName)],
    })
    if (parentEntryRegistry.toLowerCase() === ZERO_ADDRESS) throw new Error(`No ENSv2 parent registry found for ${hierarchy.parentName}`)
    const parentLabel = hierarchy.parentName.split(".")[0]
    const canAttachRegistry = await publicClient.readContract({
      address: parentEntryRegistry,
      abi: REGISTRY_ABI,
      functionName: "hasRoles",
      args: [labelId(parentLabel), ROLE_SET_SUBREGISTRY, account],
    })
    if (!canAttachRegistry) throw new Error(`Your account cannot attach a subregistry to ${hierarchy.parentName}`)
    parentChildrenRegistry = await ensureRegistry(hierarchy.parentName)
    const setParentHash = await walletClient.writeContract({
      account,
      address: parentChildrenRegistry,
      abi: REGISTRY_ABI,
      functionName: "setParent",
      args: [parentEntryRegistry, parentLabel],
    })
    await publicClient.waitForTransactionReceipt({ hash: setParentHash })
    const attachHash = await walletClient.writeContract({
      account,
      address: parentEntryRegistry,
      abi: REGISTRY_ABI,
      functionName: "setSubregistry",
      args: [labelId(parentLabel), parentChildrenRegistry],
    })
    await publicClient.waitForTransactionReceipt({ hash: attachHash })
  } else {
    const canRegister = await publicClient.readContract({
      address: parentChildrenRegistry,
      abi: REGISTRY_ABI,
      functionName: "hasRootRoles",
      args: [ROLE_REGISTRAR, account],
    })
    if (!canRegister) throw new Error(`Your account cannot register subnames under ${hierarchy.parentName}`)
  }

  const namespaceOwner = await publicClient.readContract({ address: parentChildrenRegistry, abi: REGISTRY_ABI, functionName: "findOwner", args: ["voxmesh"] })
  if (namespaceOwner.toLowerCase() !== ZERO_ADDRESS && namespaceOwner.toLowerCase() !== account.toLowerCase()) {
    throw new Error(`voxmesh.${hierarchy.parentName} is already owned by another account`)
  }

  const resolverAddress = await ensureProxy(
    publicClient,
    walletClient,
    account,
    deployment.factory,
    deployment.resolverImpl,
    resolverSalt(account),
    resolverInitializer,
  )

  const namespaceRegistry = await ensureRegistry(hierarchy.namespaceName)
  const supervisorRegistry = await ensureRegistry(hierarchy.supervisorName)
  const ensureRegistryParent = async (registry: Address, parent: Address, label: string) => {
    const [currentParent, currentLabel] = await publicClient.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "getParent" })
    if (currentParent.toLowerCase() === ZERO_ADDRESS) {
      const hash = await walletClient.writeContract({ account, address: registry, abi: REGISTRY_ABI, functionName: "setParent", args: [parent, label] })
      await publicClient.waitForTransactionReceipt({ hash })
      return
    }
    if (currentParent.toLowerCase() !== parent.toLowerCase() || currentLabel !== label) {
      throw new Error(`The registry for ${label} is already anchored to a different ENSv2 parent`)
    }
  }
  await ensureRegistryParent(namespaceRegistry, parentChildrenRegistry, "voxmesh")
  await ensureRegistryParent(supervisorRegistry, namespaceRegistry, "supervisor")
  const expiry = options.expiry === "forever" ? MAX_UINT64 : BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60)
  const roles = agentTransferRole(options.transferable)

  const ensureEntry = async (registry: Address, label: string, childRegistry: Address) => {
    const currentOwner = await publicClient.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "findOwner", args: [label] })
    if (currentOwner.toLowerCase() === ZERO_ADDRESS) {
      const hash = await walletClient.writeContract({
        account,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "register",
        args: [label, account, childRegistry, resolverAddress, roles, expiry],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      return
    }
    if (currentOwner.toLowerCase() !== account.toLowerCase()) throw new Error(`The ENS label ${label} is already owned by another account`)
    const currentChild = await publicClient.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "getSubregistry", args: [label] })
    if (childRegistry.toLowerCase() !== ZERO_ADDRESS && currentChild.toLowerCase() !== childRegistry.toLowerCase()) {
      if (currentChild.toLowerCase() !== ZERO_ADDRESS) throw new Error(`${label} already points to a different child registry`)
      const hash = await walletClient.writeContract({
        account,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "setSubregistry",
        args: [labelId(label), childRegistry],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }
    const currentResolver = await publicClient.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "getResolver", args: [label] })
    if (currentResolver.toLowerCase() !== resolverAddress.toLowerCase()) {
      if (currentResolver.toLowerCase() !== ZERO_ADDRESS) throw new Error(`${label} already points to a different resolver`)
      const hash = await walletClient.writeContract({
        account,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "setResolver",
        args: [labelId(label), resolverAddress],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    }
  }

  await ensureEntry(parentChildrenRegistry, "voxmesh", namespaceRegistry)
  await ensureEntry(namespaceRegistry, "supervisor", supervisorRegistry)
  for (const agent of agents.filter((entry) => entry.id !== "supervisor")) {
    await ensureEntry(supervisorRegistry, agent.id, zeroAddress)
  }

  const hierarchyRecords = [
    { name: hierarchy.namespaceName, id: "voxmesh", parent: hierarchy.parentName, description: "VoxMesh ENSv2 agent namespace", capabilities: "agent-namespace", endpoint: window.location.origin },
    ...agents.map((agent) => ({ name: hierarchy.agentNames[agent.id], id: agent.id, parent: agent.id === "supervisor" ? hierarchy.namespaceName : hierarchy.supervisorName, description: agent.description, capabilities: agent.capabilities.join(","), endpoint: agent.endpoint })),
  ]
  for (const entry of hierarchyRecords) {
    const values = [
      ["voxmesh.agent.id", entry.id],
      ["voxmesh.agent.parent", entry.parent],
      ["voxmesh.agent.description", entry.description],
      ["voxmesh.agent.capabilities", entry.capabilities],
      [agentTextKey(entry.id, "endpoint"), entry.endpoint],
    ] as const
    const calls = values.map(([key, value]) =>
      encodeFunctionData({ abi: RESOLVER_ABI, functionName: "setText", args: [dnsName(entry.name), key, value] }),
    )
    const hash = await walletClient.writeContract({ account, address: resolverAddress, abi: RESOLVER_ABI, functionName: "multicall", args: [calls] })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const resolvedNames = Object.fromEntries(
    await Promise.all(
      agents.map(async (agent) => {
        const name = hierarchy.agentNames[agent.id]
        const id = await publicClient.getEnsText({ name, key: "voxmesh.agent.id" })
        if (id !== agent.id) throw new Error(`ENSv2 record verification failed for ${name}`)
        return [agent.id, name] as const
      }),
    ),
  )
  return {
    account,
    parentName: hierarchy.parentName,
    namespaceName: hierarchy.namespaceName,
    agentNames: resolvedNames,
    agentEndpoints: Object.fromEntries(agents.map((agent) => [agent.id, agent.endpoint])),
    resolverAddress,
  }
}

export async function readEnsAgentHierarchy(chainId: EnsChainId, parentName: string, agents: Pick<EnsAgent, "id">[]) {
  const hierarchy = buildEnsAgentHierarchy(parentName, agents)
  const { account, publicClient, deployment } = await clients(chainId)
  const agentNames: Record<string, string> = {}
  const agentEndpoints: Record<string, string> = {}
  for (const agent of agents) {
    const name = hierarchy.agentNames[agent.id]
    const id = await publicClient.getEnsText({ name, key: "voxmesh.agent.id" }).catch(() => null)
    if (id === agent.id) {
      agentNames[agent.id] = name
      const endpoint = await publicClient.getEnsText({ name, key: agentTextKey(agent.id, "endpoint") }).catch(() => null)
      if (endpoint) agentEndpoints[agent.id] = endpoint
    }
  }
  const agentRegistry = await publicClient.readContract({
    address: deployment.helper,
    abi: HELPER_ABI,
    functionName: "findParentRegistry",
    args: [dnsName(hierarchy.agentNames.supervisor)],
  })
  const resolverAddress = agentRegistry.toLowerCase() === ZERO_ADDRESS
    ? null
    : await publicClient.readContract({ address: agentRegistry, abi: REGISTRY_ABI, functionName: "getResolver", args: ["supervisor"] })
  return {
    account,
    parentName: hierarchy.parentName,
    namespaceName: hierarchy.namespaceName,
    agentNames,
    agentEndpoints,
    resolverAddress: resolverAddress && resolverAddress.toLowerCase() !== ZERO_ADDRESS ? resolverAddress : null,
  }
}

export async function grantAgentEndpointEditor(chainId: EnsChainId, resolverAddress: Address, agentId: string, editor: string) {
  if (!isAddress(editor)) throw new Error("Enter a valid editor wallet address")
  const { account, publicClient, walletClient } = await clients(chainId)
  const key = agentTextKey(agentId, "endpoint")
  const setter = encodeFunctionData({ abi: RESOLVER_ABI, functionName: "setText", args: ["0x", key, ""] })
  const hash = await walletClient.writeContract({
    account,
    address: resolverAddress,
    abi: RESOLVER_ABI,
    functionName: "grantSetterRoles",
    args: [setter, editor as Address],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return { editor, key, transactionHash: hash }
}

export async function updateAgentEndpoint(chainId: EnsChainId, resolverAddress: Address, name: string, agentId: string, endpoint: string) {
  let parsedEndpoint: URL
  try {
    parsedEndpoint = new URL(endpoint)
  } catch {
    throw new Error("Enter a valid HTTP(S) endpoint URL")
  }
  if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") throw new Error("Endpoint URLs must use HTTP or HTTPS")
  const { account, publicClient, walletClient } = await clients(chainId)
  const key = agentTextKey(agentId, "endpoint")
  const hash = await walletClient.writeContract({
    account,
    address: resolverAddress,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [dnsName(name), key, endpoint],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  const resolved = await publicClient.getEnsText({ name, key })
  if (resolved !== endpoint) throw new Error(`ENSv2 endpoint verification failed for ${name}`)
  return resolved
}