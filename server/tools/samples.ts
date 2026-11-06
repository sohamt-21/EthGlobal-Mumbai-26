/**
 * Sample contracts for the demo. Written for VoxMesh; deliberately contain risky patterns.
 */
export type SampleContract = { id: string; name: string; description: string; source: string }

const VOX_TOKEN = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MeshToken — demo token with owner-controlled transfer rules
contract MeshToken is ERC20, Ownable {
    uint256 public sellFee = 3;          // percent
    bool public tradingEnabled;
    uint256 public maxTxAmount = 1_000_000e18;
    address public treasury;
    mapping(address => bool) public isBlacklisted;

    event FeeUpdated(uint256 fee);
    event Blacklisted(address indexed account, bool value);

    constructor(address _treasury) ERC20("Mesh Token", "MESH") Ownable(msg.sender) {
        treasury = _treasury;
        _mint(msg.sender, 100_000_000e18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setSellFee(uint256 fee) external onlyOwner {
        sellFee = fee; // no upper bound
        emit FeeUpdated(fee);
    }

    function setBlacklist(address account, bool value) external onlyOwner {
        isBlacklisted[account] = value;
        emit Blacklisted(account, value);
    }

    function enableTrading() external onlyOwner {
        tradingEnabled = true;
    }

    function rescue(address from, uint256 amount) external onlyOwner {
        _transfer(from, treasury, amount);
    }

    function claimAirdrop() external {
        require(tx.origin == msg.sender, "no contracts");
        _mint(msg.sender, 10e18);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!isBlacklisted[from] && !isBlacklisted[to], "blacklisted");
        if (from != owner() && to != owner()) {
            require(tradingEnabled, "trading closed");
            require(value <= maxTxAmount, "max tx");
            uint256 fee = (value * sellFee) / 100;
            super._update(from, treasury, fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}
`

const VAULT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title MeshVault — naive ETH vault used to demonstrate reentrancy detection
contract MeshVault {
    mapping(address => uint256) public balances;
    address public admin;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount;
        emit Withdraw(msg.sender, amount);
    }

    function lottery() external view returns (bool) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender))) % 10 == 0;
    }

    function execute(address target, bytes calldata data) external onlyAdmin {
        (bool ok, ) = target.delegatecall(data);
        require(ok, "delegatecall failed");
    }
}
`

export const SAMPLE_CONTRACTS: SampleContract[] = [
  { id: "mesh-token", name: "MeshToken.sol", description: "ERC-20 with owner mint, blacklist, unbounded fee, trading gate", source: VOX_TOKEN },
  { id: "mesh-vault", name: "MeshVault.sol", description: "ETH vault with reentrancy, weak randomness, delegatecall", source: VAULT },
]

export function getSample(id: string): SampleContract | undefined {
  return SAMPLE_CONTRACTS.find((s) => s.id === id)
}
