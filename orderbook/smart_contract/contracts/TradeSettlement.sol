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
    mapping(bytes32 => bool) public orderLocks;

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
        require(!orderLocks[orderId], "Order already locked");

        uint256 availableBalance = escrowBalances[user][token] -
            lockedBalances[user][token];

        require(availableBalance >= amount, "Insufficient escrow balance");

        lockedBalances[user][token] += amount;
        orderLocks[orderId] = true;

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
        // Prevent replay attacks
        require(
            !settledCrossChainOrders[tradeData.orderId],
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

        // Signatures removed; onlyOwner acts as the authorized matching engine

        settledCrossChainOrders[tradeData.orderId] = true;

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

        nonces[tradeData.party1][tradeData.baseAsset] = tradeData.nonce1 + 1;
        nonces[tradeData.party2][tradeData.baseAsset] = tradeData.nonce2 + 1;
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