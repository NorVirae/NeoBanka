# NeoBank Vault Smart Contracts

```
██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ███████╗██╗██╗     ██╗     
██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔════╝██║██║     ██║     
███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝█████╗  ██║██║     ██║     
██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗██╔══╝  ██║██║     ██║     
██║  ██║   ██║   ██║     ███████╗██║  ██║██║     ██║███████╗███████╗
╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝

          First AI Market Making Vault on Hedera Network 
              
```

> **ERC4626 vault with integrated trade settlement system for AI market making on Hedera**

## Overview

NeoBank Vault is a core smart contract system deployed on Hedera Network connected with autonomous financial agents. The system has two main contracts: a liquidity vault for user deposits and a trade settlement contract for multi party trading.

## Smart Contract Architecture

### NeoBankVault.sol
An ERC4626-compliant vault that manages user liquidity and AI agent capital allocation.

**Features:**
- **Liquidity**: Deposit/withdraw HBAR tokens
- **Share**: ERC4626 standard implementation
- **Agent Capital**: Secure fund movement to/from trading wallets
- **Fee**: Management and withdrawal fees with time-based calculations
- **Security**: ReentrancyGuard, Pausable and access controls

**Functions:**
```solidity
function depositLiquidity(uint256 assets) external returns (uint256 shares)
function withdrawProfits() external returns (uint256 assets)
function moveFromVaultToWallet(uint256 amount, address tradingWallet) external
function moveFromWalletToVault(uint256 amount, uint256 profitAmount, address fromWallet) external
```

### TradeSettlement.sol
A cryptographically secure multi-party trade settlement system.

**Features:**
- **Signature**: ECDSA signature validation for trade authorization
- **Management**: Replay attack prevention
- **Settlement**: Simultaneous asset exchange between parties
- **Balance**: Pre-execution balance and allowance checks

**Functions:**
```solidity
function settleTrade(TradeExecution tradeData, ...) external
function verifyTradeSignature(...) external pure returns (bool)
function batchCheckAllowances(...) external view returns (bool[], uint256[])
```

##  Technical Specifications

### NeoBankVault

**Inheritance:**
- `ERC4626` (OpenZeppelin) - Standard vault interface
- `Ownable` (OpenZeppelin) - Access control
- `ReentrancyGuard` (OpenZeppelin) - Reentrancy protection
- `Pausable` (OpenZeppelin) - Emergency controls

**State Variables:**
```solidity
mapping(address => bool) public authorizedAgents;
mapping(address => uint256) public shareToUser;
uint256 public minDeposit = 1e18; // 1 HBAR minimum
uint256 public maxAllocationBps = 9000; // 90% max allocation
uint256 public managementFeeBps = 200; // 2% annual
uint256 public withdrawalFeeBps = 10; // 0.1% on withdrawal
```

**Fee Structure:**
- **Management Fee**: 2% annually on AUM, calculated continuously
- **Withdrawal Fee**: 0.1% on withdrawal amount

### TradeSettlement

**Core Structures:**
```solidity
struct TradeExecution {
    uint256 orderId;
    address account;
    uint256 price;
    uint256 quantity;
    string side;
    address baseAsset;
    address quoteAsset;
    string tradeId;
    uint256 timestamp;
    bool isValid;
}
```

**Security Features:**
- ECDSA signature verification with EIP-191 message hashing
- Per-user, per-token nonce system
- Trade hash deduplication
- Pre-execution balance and allowance validation

## Deployment

### Prerequisites
```bash
npm install
```

### Environment Setup
Create `.env` file:
```env
HEDERA_PRIVATE_KEY=your_private_key_here
HEDERA_RPC_URL=https://testnet.hashio.io/api
```

### Deploy to Hedera Testnet
```bash
# Deploy NeoBankVault
npx hardhat run scripts/deploy.ts --network testnet

# Deploy TradeSettlement
npx hardhat run scripts/deployTradeSettlement.ts --network testnet
```

### Network Configuration
```javascript
// hardhat.config.ts
testnet: {
  url: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
  chainId: 296,
  accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : []
}
```

## Testing

### Comprehensive Test Suite
```bash
# Run all tests
npx hardhat test

# Test vault deposit functionality
npx hardhat run scripts/testFile/testDeposit.ts --network testnet

# Test vault withdrawal
npx hardhat run scripts/testFile/testWithdraw.ts --network testnet

# Test trade settlement
npx hardhat run scripts/testFile/testSettlement.ts --network testnet
```

### Test Coverage
-  Deposit/withdraw flows
-  Fee calculations
-  Agent capital allocation
-  Trade signature verification
-  Multi-party settlement
-  Error handling and edge cases

##  Contract Addresses (Hedera Testnet)

```
NeoBankVault: [To be deployed]
TradeSettlement: [To be deployed]
HBAR Token: [Native token]
```

## Security

### Access
- **Owner-only functions**: Fee management, agent authorization, emergency controls
- **Agent-only functions**: Capital allocation and movement
- **User functions**: Deposit, withdraw with proper validation

### Measures
- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Emergency stop mechanism
- **Signature Verification**: Cryptographic trade authorization
- **Nonce System**: Prevents replay attacks
- **Balance Validation**: Pre-execution checks


##  Usage Examples

### Vault Operations
```javascript
// Deposit HBAR
const depositTx = await vault.depositLiquidity(ethers.parseEther("100"));

// Check user shares
const shares = await vault.getUserShareBalance(userAddress);

// Withdraw all shares
const withdrawTx = await vault.withdrawProfits();
```

### Agent Operations
```javascript
// Allocate capital to trading wallet
await vault.moveFromVaultToWallet(
    ethers.parseEther("50"),
    tradingWalletAddress
);

// Return capital with profits
await vault.moveFromWalletToVault(
    ethers.parseEther("55"), // total returned
    ethers.parseEther("5"),  // profit amount
    tradingWalletAddress
);
```

### Trade Settlement
```javascript
// Settle bilateral trade
await tradeSettlement.settleTrade(
    tradeData,
    party1Address,
    party2Address,
    party1Quantity,
    party2Quantity,
    "bid",
    "ask",
    signature1,
    signature2,
    nonce1,
    nonce2
);
```

##  License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the Hedera ecosystem**
