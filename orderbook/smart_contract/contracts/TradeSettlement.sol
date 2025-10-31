// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "hardhat/console.sol";

contract TradeSettlement is ReentrancyGuard, Ownable {

    struct CrossChainTradeData {
        bytes32 orderId;
        address party1;
        address party2;
        address party1ReceiveWallet;
        address party2ReceiveWallet;
        address baseAsset;
        address quoteAsset;
        uint256 price;
        uint256 quantity;
        string party1Side;
        string party2Side;
        uint256 sourceChainId;
        uint256 destinationChainId;
        uint256 timestamp;
        uint256 nonce1;
        uint256 nonce2;
    }

    struct SettlementStatus {
        bool sourceChainSettled;
        bool destinationChainSettled;
        uint256 sourceChainTimestamp;
        uint256 destinationChainTimestamp;
        bool refunded;
    }

    // Escrow mappings
    mapping(address => mapping(address => uint256)) public escrowBalances;
    mapping(address => mapping(address => uint256)) public lockedBalances;
    // Legacy lock flag (kept for backward compatibility, no longer used for enforcement)
    mapping(bytes32 => bool) public orderLocks;
    // Chain-aware order lock to allow locking per leg (source/destination)
    mapping(bytes32 => mapping(uint256 => bool)) public orderLocksByChain;

    // Cross-chain mappings
    mapping(bytes32 => bool) public settledCrossChainOrders;
    mapping(address => mapping(address => uint256)) public nonces;
    mapping(bytes32 => bool) public executedTrades;
    mapping(bytes32 => SettlementStatus) public settlementStatuses;
    mapping(bytes32 => mapping(uint256 => bool)) public settlementByChain;

    // Events
    event EscrowDepositEvent(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    event EscrowWithdraw(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 timestamp
    );

    event EscrowLocked(
        address indexed user,
        address indexed token,
        uint256 amount,
        bytes32 indexed orderId
    );

    event CrossChainTradeSettled(
        bytes32 indexed orderId,
        address indexed sender,
        address indexed receiver,
        address assetSent,
        uint256 amountSent,
        uint256 chainId,
        bool isSourceChain,
        uint256 timestamp
    );

    event SettlementFailed(
        bytes32 indexed orderId,
        uint256 chainId,
        bool isSourceChain,
        string reason,
        uint256 timestamp
    );

    event AsymmetricSettlementDetected(
        bytes32 indexed orderId,
        uint256 settledChainId,
        uint256 failedChainId,
        uint256 timestamp
    );

    event EmergencyRefund(
        bytes32 indexed orderId,
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 chainId,
        uint256 timestamp
    );

    uint256 public constant SETTLEMENT_TIMEOUT = 1 hours;

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Deposit tokens into escrow
     */
    function depositToEscrow(
        address token,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");

        IERC20 tokenContract = IERC20(token);
        require(
            tokenContract.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        escrowBalances[msg.sender][token] += amount;

        emit EscrowDepositEvent(msg.sender, token, amount, block.timestamp);
    }

    /**
     * @dev Withdraw tokens from escrow (only unlocked amount)
     */
    function withdrawFromEscrow(
        address token,
        uint256 amount
    ) external nonReentrant {
        uint256 availableBalance = escrowBalances[msg.sender][token] -
            lockedBalances[msg.sender][token];

        require(amount > 0, "Amount must be greater than 0");
        require(availableBalance >= amount, "Insufficient available balance");

        escrowBalances[msg.sender][token] -= amount;

        IERC20 tokenContract = IERC20(token);
        require(tokenContract.transfer(msg.sender, amount), "Transfer failed");

        emit EscrowWithdraw(msg.sender, token, amount, block.timestamp);
    }

    /**
     * @dev Lock escrow funds for an order
     */
    function lockEscrowForOrder(
        address user,
        address token,
        uint256 amount,
        bytes32 orderId
    ) external onlyOwner {
        // Allow one lock per chain for the same orderId
        uint256 cid = block.chainid;
        require(!orderLocksByChain[orderId][cid], "Order already locked on this chain");

        uint256 availableBalance = escrowBalances[user][token] -
            lockedBalances[user][token];

        require(availableBalance >= amount, "Insufficient escrow balance");

        lockedBalances[user][token] += amount;
        orderLocksByChain[orderId][cid] = true;

        emit EscrowLocked(user, token, amount, orderId);
    }

    // Signatures removed; settlement is authorized via onlyOwner

    /**
     * @dev Settle cross-chain trade - P2P atomic swap without bridge
     * 
     * Example: TraderA (ChainA - ask/sell HBAR) <-> TraderB (ChainB - bid/buy HBAR with USDT)
     * 
     * ON CHAIN A (Source Chain):
     * - TraderA (party1) sends HBAR from escrow → TraderB's receiving wallet (party2ReceiveWallet)
     * 
     * ON CHAIN B (Destination Chain):
     * - TraderB (party2) sends USDT from escrow → TraderA's receiving wallet (party1ReceiveWallet)
     * 
     * Both settlements must succeed for atomic swap completion
     */
    function settleCrossChainTrade(
        CrossChainTradeData memory tradeData,
        bool isSourceChain
    ) external nonReentrant onlyOwner {
        // Lock required funds for this leg if not already locked on this chain
        _ensureLockForCurrentChain(tradeData, isSourceChain);
        // Prevent replay attacks per chain (allow one settle per leg)
        require(
            !settlementByChain[tradeData.orderId][block.chainid],
            "Order already settled on this chain"
        );
        
        // Verify we're on the correct chain
        if (isSourceChain) {
            // console.log(block.chainid);
            // console.log(tradeData.sourceChainId);
            // console.log(tradeData.destinationChainId);
            // console.log("=======");

            require(block.chainid == tradeData.sourceChainId, "Not source chain");
        } else {
            require(block.chainid == tradeData.destinationChainId, "Not destination chain");
        }

        // Validate receive wallets
        require(tradeData.party1ReceiveWallet != address(0), "Invalid party1 receive wallet");
        require(tradeData.party2ReceiveWallet != address(0), "Invalid party2 receive wallet");

        // Validate opposite sides
        bool validSides = (
            keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("ask")) &&
            keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("bid"))
        ) || (
            keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("bid")) &&
            keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("ask"))
        );
        require(validSides, "Parties must be on opposite sides");

        // Note: global replay is managed per-chain via settlementByChain; avoid blocking the second leg

        // Signatures removed; onlyOwner acts as the authorized matching engine

        // Mark the current chain leg as settled (global status recorded below)

        uint256 currentChainId = block.chainid;
        settlementByChain[tradeData.orderId][currentChainId] = true;

        uint256 baseAmount = tradeData.quantity;
        uint256 quoteAmount = (tradeData.quantity * tradeData.price) / 1e18;

        if (isSourceChain) {
            _settleSourceChain(tradeData, baseAmount);
            settlementStatuses[tradeData.orderId].sourceChainSettled = true;
            settlementStatuses[tradeData.orderId].sourceChainTimestamp = block.timestamp;
        } else {
            _settleDestinationChain(tradeData, quoteAmount);
            settlementStatuses[tradeData.orderId].destinationChainSettled = true;
            settlementStatuses[tradeData.orderId].destinationChainTimestamp = block.timestamp;
        }

        // Advance nonces per leg
        if (isSourceChain) {
            // Source: party1 (ask) base nonce
            nonces[tradeData.party1][tradeData.baseAsset] = tradeData.nonce1 + 1;
        } else {
            // Destination: party2 (bid) quote nonce
            nonces[tradeData.party2][tradeData.quoteAsset] = tradeData.nonce2 + 1;
        }
    }

    /**
     * @dev Handle settlement on source chain (ChainA)
     * 
     * On source chain, we transfer the BASE asset:
     * - If party1 is "ask" (selling base): party1 sends base → party2ReceiveWallet
     * - If party1 is "bid" (buying base): party2 sends base → party1ReceiveWallet
     * 
     * Note: party2 is not on this chain, so party2ReceiveWallet is their designated wallet on ChainA
     */
    function _settleSourceChain(
        CrossChainTradeData memory tradeData,
        uint256 baseAmount
    ) internal {
        address sender;
        address receiver;
        uint256 amount;
        
        // Determine who sends base asset on source chain
        if (keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("ask"))) {
            // Party1 is selling base (ask side)
            // Party1 sends base → Party2's receive wallet on this chain
            sender = tradeData.party1;
            receiver = tradeData.party2ReceiveWallet;
            amount = baseAmount;
        } else {
            // Party1 is buying base (bid side)
            // Party2 sends base → Party1's wallet (party1 is already on this chain)
            // BUT party2 is on destination chain, so this shouldn't happen on source chain
            // In this case, party2ReceiveWallet should have the base to receive
            revert("Invalid configuration: party2 cannot send from source chain");
        }

        // Verify locked balance
        require(
            lockedBalances[sender][tradeData.baseAsset] >= amount,
            "Insufficient locked base balance on source chain"
        );

        // Deduct from sender's locked escrow
        lockedBalances[sender][tradeData.baseAsset] -= amount;
        escrowBalances[sender][tradeData.baseAsset] -= amount;

        // Transfer base asset to receiver's wallet
        IERC20 baseToken = IERC20(tradeData.baseAsset);
        require(
            baseToken.transfer(receiver, amount),
            "Base asset transfer failed on source chain"
        );

        emit CrossChainTradeSettled(
            tradeData.orderId,
            sender,
            receiver,
            tradeData.baseAsset,
            amount,
            tradeData.sourceChainId,
            true,
            block.timestamp
        );
    }

    /**
     * @dev Handle settlement on destination chain (ChainB)
     * 
     * On destination chain, we transfer the QUOTE asset:
     * - If party2 is "bid" (buying base with quote): party2 sends quote → party1ReceiveWallet
     * - If party2 is "ask" (selling base for quote): party1 sends quote → party2ReceiveWallet
     * 
     * Note: party1 is not on this chain, so party1ReceiveWallet is their designated wallet on ChainB
     */
    function _settleDestinationChain(
        CrossChainTradeData memory tradeData,
        uint256 quoteAmount
    ) internal {
        address sender;
        address receiver;
        uint256 amount;
        
        // Determine who sends quote asset on destination chain
        if (keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("bid"))) {
            // Party2 is buying base with quote (bid side)
            // Party2 sends quote → Party1's receive wallet on this chain
            sender = tradeData.party2;
            receiver = tradeData.party1ReceiveWallet;
            amount = quoteAmount;
        } else {
            // Party2 is selling base for quote (ask side)
            // Party1 sends quote → Party2's wallet (party2 is already on this chain)
            // BUT party1 is on source chain, so this shouldn't happen on destination chain
            revert("Invalid configuration: party1 cannot send from destination chain");
        }

        // Verify locked balance
        require(
            lockedBalances[sender][tradeData.quoteAsset] >= amount,
            "Insufficient locked quote balance on destination chain"
        );

        // Deduct from sender's locked escrow
        lockedBalances[sender][tradeData.quoteAsset] -= amount;
        escrowBalances[sender][tradeData.quoteAsset] -= amount;

        // Transfer quote asset to receiver's wallet
        IERC20 quoteToken = IERC20(tradeData.quoteAsset);
        require(
            quoteToken.transfer(receiver, amount),
            "Quote asset transfer failed on destination chain"
        );

        emit CrossChainTradeSettled(
            tradeData.orderId,
            sender,
            receiver,
            tradeData.quoteAsset,
            amount,
            tradeData.destinationChainId,
            false,
            block.timestamp
        );
    }

    function _ensureLockForCurrentChain(
        CrossChainTradeData memory tradeData,
        bool isSourceChain
    ) internal {
        uint256 cid = block.chainid;
        if (orderLocksByChain[tradeData.orderId][cid]) {
            return; // already locked on this chain
        }

        if (isSourceChain) {
            // party1 must be ask (selling base) on source chain
            require(
                keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("ask")),
                "Invalid source side"
            );
            uint256 amount = tradeData.quantity;
            uint256 available = escrowBalances[tradeData.party1][tradeData.baseAsset] -
                lockedBalances[tradeData.party1][tradeData.baseAsset];
            require(available >= amount, "Insufficient escrow to lock (source)");
            lockedBalances[tradeData.party1][tradeData.baseAsset] += amount;
            orderLocksByChain[tradeData.orderId][cid] = true;
            emit EscrowLocked(tradeData.party1, tradeData.baseAsset, amount, tradeData.orderId);
        } else {
            // party2 must be bid (buying base with quote) on destination chain
            require(
                keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("bid")),
                "Invalid dest side"
            );
            uint256 amount = (tradeData.quantity * tradeData.price) / 1e18;
            uint256 available = escrowBalances[tradeData.party2][tradeData.quoteAsset] -
                lockedBalances[tradeData.party2][tradeData.quoteAsset];
            require(available >= amount, "Insufficient escrow to lock (dest)");
            lockedBalances[tradeData.party2][tradeData.quoteAsset] += amount;
            orderLocksByChain[tradeData.orderId][cid] = true;
            emit EscrowLocked(tradeData.party2, tradeData.quoteAsset, amount, tradeData.orderId);
        }
    }

    /**
     * @dev Settle same-chain trade by locking and transferring both legs atomically on a single chain
     */
    function settleSameChainTrade(
        CrossChainTradeData memory tradeData
    ) external nonReentrant onlyOwner {
        // Must be same chain for both legs
        require(
            tradeData.sourceChainId == tradeData.destinationChainId,
            "Not same-chain trade"
        );
        require(block.chainid == tradeData.sourceChainId, "Wrong chain");

        // Validate receive wallets
        require(tradeData.party1ReceiveWallet != address(0), "Invalid party1 receive wallet");
        require(tradeData.party2ReceiveWallet != address(0), "Invalid party2 receive wallet");

        // Validate opposite sides
        bool validSides = (
            keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("ask")) &&
            keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("bid"))
        ) || (
            keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("bid")) &&
            keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("ask"))
        );
        require(validSides, "Parties must be on opposite sides");

        // Prevent replay on this chain
        require(!settledCrossChainOrders[tradeData.orderId], "Order already settled on this chain");

        // Create unique trade hash
        bytes32 tradeHash = keccak256(
            abi.encodePacked(
                tradeData.orderId,
                tradeData.party1,
                tradeData.party2,
                tradeData.baseAsset,
                tradeData.quoteAsset,
                tradeData.price,
                tradeData.quantity,
                tradeData.sourceChainId,
                tradeData.destinationChainId,
                tradeData.timestamp
            )
        );
        require(!executedTrades[tradeHash], "Trade already executed");
        executedTrades[tradeHash] = true;

        // Amounts
        uint256 baseAmount = tradeData.quantity;
        uint256 quoteAmount = (tradeData.quantity * tradeData.price) / 1e18;

        // Lock both legs if not locked
        if (keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("ask"))) {
            // party1 sells base, party2 buys with quote
            _lockRequired(tradeData.party1, tradeData.baseAsset, baseAmount);
            _lockRequired(tradeData.party2, tradeData.quoteAsset, quoteAmount);
            // Transfers
            _transferToken(tradeData.baseAsset, tradeData.party1, tradeData.party2ReceiveWallet, baseAmount, true);
            _transferToken(tradeData.quoteAsset, tradeData.party2, tradeData.party1ReceiveWallet, quoteAmount, false);
        } else {
            // party1 buys base, party2 sells base
            _lockRequired(tradeData.party2, tradeData.baseAsset, baseAmount);
            _lockRequired(tradeData.party1, tradeData.quoteAsset, quoteAmount);
            // Transfers
            _transferToken(tradeData.baseAsset, tradeData.party2, tradeData.party1ReceiveWallet, baseAmount, true);
            _transferToken(tradeData.quoteAsset, tradeData.party1, tradeData.party2ReceiveWallet, quoteAmount, false);
        }

        // Mark settled
        settledCrossChainOrders[tradeData.orderId] = true;
        uint256 currentChainId = block.chainid;
        settlementByChain[tradeData.orderId][currentChainId] = true;
        settlementStatuses[tradeData.orderId].sourceChainSettled = true;
        settlementStatuses[tradeData.orderId].destinationChainSettled = true;
        settlementStatuses[tradeData.orderId].sourceChainTimestamp = block.timestamp;
        settlementStatuses[tradeData.orderId].destinationChainTimestamp = block.timestamp;

        // Advance nonces
        nonces[tradeData.party1][tradeData.baseAsset] = tradeData.nonce1 + 1;
        nonces[tradeData.party2][tradeData.baseAsset] = tradeData.nonce2 + 1;
    }

    function _lockIfNeeded(bytes32 orderId, address user, address token, uint256 amount) internal {
        uint256 cid = block.chainid;
        if (!orderLocksByChain[orderId][cid]) {
            uint256 available = escrowBalances[user][token] - lockedBalances[user][token];
            require(available >= amount, "Insufficient escrow to lock (same)");
            lockedBalances[user][token] += amount;
            orderLocksByChain[orderId][cid] = true;
            emit EscrowLocked(user, token, amount, orderId);
        }
    }

    function _lockRequired(address user, address token, uint256 amount) internal {
        uint256 available = escrowBalances[user][token] - lockedBalances[user][token];
        require(available >= amount, "Insufficient escrow to lock");
        lockedBalances[user][token] += amount;
        emit EscrowLocked(0x0000000000000000000000000000000000000000, token, amount, bytes32(0));
        // Note: orderId not known for generic lock here; event still indicates token/amount
    }

    function _transferToken(address token, address fromUser, address to, uint256 amount, bool isBase) internal {
        // Reduce sender escrow and locked
        require(lockedBalances[fromUser][token] >= amount, "Insufficient locked balance");
        lockedBalances[fromUser][token] -= amount;
        escrowBalances[fromUser][token] -= amount;

        IERC20 tkn = IERC20(token);
        require(tkn.transfer(to, amount), "Token transfer failed");

        emit CrossChainTradeSettled(
            0x0, // not indexing order id here since emitted twice already via lock events; kept minimal
            fromUser,
            to,
            token,
            amount,
            block.chainid,
            isBase,
            block.timestamp
        );
    }

    /**
     * @dev Get user nonce for a specific token
     */
    function getUserNonce(
        address user,
        address token
    ) external view returns (uint256) {
        return nonces[user][token];
    }

    /**
     * @dev Check escrow balance (total and available)
     */
    function checkEscrowBalance(
        address user,
        address token
    ) public view returns (uint256 total, uint256 available, uint256 locked) {
        total = escrowBalances[user][token];
        locked = lockedBalances[user][token];
        available = total - locked;
        return (total, available, locked);
    }

    function reportSettlementFailure(
        bytes32 orderId,
        uint256 failedChainId,
        bool isSourceChain,
        string memory reason
    ) external onlyOwner {
        emit SettlementFailed(orderId, failedChainId, isSourceChain, reason, block.timestamp);

        SettlementStatus storage status = settlementStatuses[orderId];

        if (isSourceChain && status.destinationChainSettled && !status.sourceChainSettled) {
            emit AsymmetricSettlementDetected(
                orderId,
                failedChainId == status.sourceChainTimestamp ? failedChainId : block.chainid,
                failedChainId,
                block.timestamp
            );
        } else if (!isSourceChain && status.sourceChainSettled && !status.destinationChainSettled) {
            emit AsymmetricSettlementDetected(
                orderId,
                failedChainId == status.destinationChainTimestamp ? failedChainId : block.chainid,
                failedChainId,
                block.timestamp
            );
        }
    }

    function emergencyRefundAsymmetricSettlement(
        bytes32 orderId,
        CrossChainTradeData memory tradeData,
        bytes memory /*settlementProof*/
    ) external nonReentrant onlyOwner {
        SettlementStatus storage status = settlementStatuses[orderId];

        require(!status.refunded, "Already refunded");
        require(
            status.sourceChainSettled != status.destinationChainSettled,
            "Not an asymmetric settlement"
        );

        uint256 currentChainId = block.chainid;
        bool isSourceChain = currentChainId == tradeData.sourceChainId;

        require(
            settlementByChain[orderId][currentChainId],
            "Settlement not executed on this chain"
        );

        if (isSourceChain && status.sourceChainSettled) {
            uint256 baseAmount = tradeData.quantity;
            address refundRecipient;

            if (keccak256(abi.encodePacked(tradeData.party1Side)) == keccak256(abi.encodePacked("ask"))) {
                refundRecipient = tradeData.party1;
            } else {
                revert("Invalid refund configuration");
            }

            IERC20 baseToken = IERC20(tradeData.baseAsset);
            require(
                baseToken.transferFrom(tradeData.party2ReceiveWallet, refundRecipient, baseAmount),
                "Refund transfer failed"
            );

            emit EmergencyRefund(
                orderId,
                refundRecipient,
                tradeData.baseAsset,
                baseAmount,
                currentChainId,
                block.timestamp
            );
        } else if (!isSourceChain && status.destinationChainSettled) {
            uint256 quoteAmount = (tradeData.quantity * tradeData.price) / 1e18;
            address refundRecipient;

            if (keccak256(abi.encodePacked(tradeData.party2Side)) == keccak256(abi.encodePacked("bid"))) {
                refundRecipient = tradeData.party2;
            } else {
                revert("Invalid refund configuration");
            }

            IERC20 quoteToken = IERC20(tradeData.quoteAsset);
            require(
                quoteToken.transferFrom(tradeData.party1ReceiveWallet, refundRecipient, quoteAmount),
                "Refund transfer failed"
            );

            emit EmergencyRefund(
                orderId,
                refundRecipient,
                tradeData.quoteAsset,
                quoteAmount,
                currentChainId,
                block.timestamp
            );
        }

        status.refunded = true;
    }

    function getSettlementStatus(
        bytes32 orderId
    ) external view returns (
        bool sourceChainSettled,
        bool destinationChainSettled,
        uint256 sourceChainTimestamp,
        uint256 destinationChainTimestamp,
        bool refunded
    ) {
        SettlementStatus memory status = settlementStatuses[orderId];
        return (
            status.sourceChainSettled,
            status.destinationChainSettled,
            status.sourceChainTimestamp,
            status.destinationChainTimestamp,
            status.refunded
        );
    }

    function checkAsymmetricSettlement(
        bytes32 orderId,
        uint256 sourceChainId,
        uint256 destinationChainId
    ) external view returns (bool isAsymmetric, uint256 settledChainId) {
        SettlementStatus memory status = settlementStatuses[orderId];

        if (status.sourceChainSettled && !status.destinationChainSettled) {
            return (true, sourceChainId);
        } else if (!status.sourceChainSettled && status.destinationChainSettled) {
            return (true, destinationChainId);
        }

        return (false, 0);
    }
}