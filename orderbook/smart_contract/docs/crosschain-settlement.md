# Cross-Chain P2P Trade Settlement Flow

## Scenario: TraderA sells 100 HBAR for 500 USDT to TraderB

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         CROSS-CHAIN ATOMIC SWAP (NO BRIDGE)                         │
└─────────────────────────────────────────────────────────────────────────────────────┘

╔═══════════════════════════════════╗          ╔═══════════════════════════════════╗
║         CHAIN A (Source)          ║          ║      CHAIN B (Destination)        ║
║          (HBAR Chain)             ║          ║         (USDT Chain)              ║
╚═══════════════════════════════════╝          ╚═══════════════════════════════════╝

┌───────────────────────────────────┐          ┌───────────────────────────────────┐
│        TraderA (Party1)           │          │        TraderB (Party2)           │
│  ┌─────────────────────────────┐  │          │  ┌─────────────────────────────┐  │
│  │   Side: "ask" (selling)     │  │          │  │   Side: "bid" (buying)      │  │
│  │   Has: 100 HBAR in escrow   │  │          │  │   Has: 500 USDT in escrow   │  │
│  │   Wants: 500 USDT           │  │          │  │   Wants: 100 HBAR           │  │
│  └─────────────────────────────┘  │          │  └─────────────────────────────┘  │
└───────────────────────────────────┘          └───────────────────────────────────┘
            │                                                  │
            │ Signs order with:                                │ Signs order with:
            │ - orderId                                        │ - orderId
            │ - baseAsset (HBAR)                               │ - baseAsset (HBAR)
            │ - quoteAsset (USDT)                              │ - quoteAsset (USDT)
            │ - price: 5 USDT/HBAR                             │ - price: 5 USDT/HBAR
            │ - quantity: 100 HBAR                             │ - quantity: 100 HBAR
            │ - party1ReceiveWallet (on ChainB) ◄──────────────┼─ Provides wallet addr
            │ - sourceChainId, destChainId                     │ - party2ReceiveWallet (on ChainA)
            │ - nonce1, timestamp                              │ - sourceChainId, destChainId
            │                                                  │ - nonce2, timestamp
            ▼                                                  ▼
┌───────────────────────────────────┐          ┌───────────────────────────────────┐
│    Settlement Contract (ChainA)   │          │    Settlement Contract (ChainB)   │
│                                   │          │                                   │
│  settleCrossChainTrade()          │          │  settleCrossChainTrade()          │
│  - isSourceChain: true            │          │  - isSourceChain: false           │
│  - Verifies signatures            │          │  - Verifies signatures            │
│  - Verifies matching engine sig   │          │  - Verifies matching engine sig   │
└───────────────────────────────────┘          └───────────────────────────────────┘
            │                                                  │
            │ _settleSourceChain()                             │ _settleDestinationChain()
            ▼                                                  ▼
┌───────────────────────────────────┐          ┌───────────────────────────────────┐
│                                   │          │                                   │
│  1. Check party1Side = "ask"      │          │  1. Check party2Side = "bid"      │
│                                   │          │                                   │
│  2. Calculate amounts:            │          │  2. Calculate amounts:            │
│     baseAmount = 100 HBAR         │          │     quoteAmount = 500 USDT        │
│                                   │          │                                   │
│  3. Verify locked balance:        │          │  3. Verify locked balance:        │
│     lockedBalances[TraderA][HBAR] │          │     lockedBalances[TraderB][USDT] │
│     >= 100 HBAR ✓                 │          │     >= 500 USDT ✓                 │
│                                   │          │                                   │
│  4. Deduct from escrow:           │          │  4. Deduct from escrow:           │
│     lockedBalances[TraderA][HBAR] │          │     lockedBalances[TraderB][USDT] │
│     -= 100 HBAR                   │          │     -= 500 USDT                   │
│     escrowBalances[TraderA][HBAR] │          │     escrowBalances[TraderB][USDT] │
│     -= 100 HBAR                   │          │     -= 500 USDT                   │
│                                   │          │                                   │
└───────────────────────────────────┘          └───────────────────────────────────┘
            │                                                  │
            │ Transfer                                         │ Transfer
            ▼                                                  ▼
┌───────────────────────────────────┐          ┌───────────────────────────────────┐
│  party2ReceiveWallet (ChainA)     │          │  party1ReceiveWallet (ChainB)     │
│  ┌─────────────────────────────┐  │          │  ┌─────────────────────────────┐  │
│  │  Receives: 100 HBAR         │  │          │  │  Receives: 500 USDT         │  │
│  │  (TraderB's wallet on       │  │          │  │  (TraderA's wallet on       │  │
│  │   ChainA)                   │  │          │  │   ChainB)                   │  │
│  └─────────────────────────────┘  │          │  └─────────────────────────────┘  │
└───────────────────────────────────┘          └───────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════

                              FINAL RESULT (ATOMIC SWAP)

TraderA Status:                                 TraderB Status:
  ✓ Sent: 100 HBAR (from ChainA)                 ✓ Sent: 500 USDT (from ChainB)
  ✓ Received: 500 USDT (on ChainB wallet)        ✓ Received: 100 HBAR (on ChainA wallet)

═══════════════════════════════════════════════════════════════════════════════════
```

## Key Components

### 1. Pre-Settlement Setup

```
TraderA (ChainA):                      TraderB (ChainB):
├─ Deposits 100 HBAR to escrow         ├─ Deposits 500 USDT to escrow
├─ Locks funds for orderId             ├─ Locks funds for orderId
└─ Provides wallet address on ChainB   └─ Provides wallet address on ChainA
```

### 2. Trade Data Structure

```
CrossChainTradeData {
    orderId: 0x123...
    party1: 0xTraderA...              // On ChainA
    party2: 0xTraderB...              // On ChainB
    party1ReceiveWallet: 0xAddr...    // TraderA's wallet on ChainB
    party2ReceiveWallet: 0xAddr...    // TraderB's wallet on ChainA
    baseAsset: HBAR_ADDRESS
    quoteAsset: USDT_ADDRESS
    price: 5000000000000000000        // 5 USDT per HBAR (18 decimals)
    quantity: 100000000000000000000   // 100 HBAR (18 decimals)
    party1Side: "ask"
    party2Side: "bid"
    sourceChainId: CHAIN_A_ID
    destinationChainId: CHAIN_B_ID
    timestamp: 1234567890
    nonce1: 0
    nonce2: 0
}
```

### 3. Signature Verification Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    SIGNATURE CHECKS                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Party1 Signature (TraderA)                               │
│     ├─ Signs: orderId, assets, price, quantity, side,       │
│     │         receiveWallet, chainIds, timestamp, nonce     │
│     └─ Verified: ✓ Signature matches party1 address         │
│                                                              │
│  2. Party2 Signature (TraderB)                               │
│     ├─ Signs: orderId, assets, price, quantity, side,       │
│     │         receiveWallet, chainIds, timestamp, nonce     │
│     └─ Verified: ✓ Signature matches party2 address         │
│                                                              │
│  3. Matching Engine Signature (Owner)                        │
│     ├─ Signs: orderId, parties, wallets, assets, price,     │
│     │         quantity, isSourceChain, chainId              │
│     └─ Verified: ✓ Signature matches owner address          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4. Settlement Logic

```
IF isSourceChain == true (ChainA):
    ├─ IF party1Side == "ask":
    │   ├─ sender = party1 (TraderA)
    │   ├─ receiver = party2ReceiveWallet
    │   ├─ asset = baseAsset (HBAR)
    │   └─ amount = baseAmount (100 HBAR)
    │
    └─ IF party1Side == "bid":
        └─ REVERT ("party2 cannot send from source chain")

IF isSourceChain == false (ChainB):
    ├─ IF party2Side == "bid":
    │   ├─ sender = party2 (TraderB)
    │   ├─ receiver = party1ReceiveWallet
    │   ├─ asset = quoteAsset (USDT)
    │   └─ amount = quoteAmount (500 USDT)
    │
    └─ IF party2Side == "ask":
        └─ REVERT ("party1 cannot send from destination chain")
```

### 5. Security Features

```
┌─────────────────────────────────────────────────────────┐
│  PROTECTION MECHANISMS                                  │
├─────────────────────────────────────────────────────────┤
│  ✓ ReentrancyGuard - Prevents reentrant calls          │
│  ✓ Trade Hash - Prevents replay attacks                │
│  ✓ Order Settlement Mapping - One settlement per chain │
│  ✓ Chain ID Verification - Ensures correct chain       │
│  ✓ Triple Signature Verification - All parties sign    │
│  ✓ Opposite Sides Validation - Buyer/Seller match      │
│  ✓ Locked Balance Check - Sufficient funds locked      │
│  ✓ Nonce Tracking - Prevents signature reuse           │
└─────────────────────────────────────────────────────────┘
```

## Execution Timeline

```
Time    ChainA (Source)              ChainB (Destination)
─────   ──────────────────────       ───────────────────────
T0      TraderA deposits HBAR        TraderB deposits USDT
        ↓                            ↓
T1      Funds locked in escrow       Funds locked in escrow
        ↓                            ↓
T2      Order submitted              Order submitted
        ↓                            ↓
T3      Matching engine matches orders
        ↓                            ↓
T4      settleCrossChainTrade()      settleCrossChainTrade()
        called with isSourceChain    called with isSourceChain
        = true                       = false
        ↓                            ↓
T5      Signatures verified          Signatures verified
        ↓                            ↓
T6      _settleSourceChain()         _settleDestinationChain()
        ↓                            ↓
T7      100 HBAR transferred to      500 USDT transferred to
        party2ReceiveWallet          party1ReceiveWallet
        ↓                            ↓
T8      Event emitted                Event emitted
        ↓                            ↓
T9      ✓ Settlement complete        ✓ Settlement complete
```

## Error Cases

```
Possible Failures:
├─ "Order already settled on this chain"
│   └─ Prevention: settledCrossChainOrders mapping
│
├─ "Not source/destination chain"
│   └─ Prevention: chainId verification
│
├─ "Invalid receive wallet"
│   └─ Prevention: address(0) checks
│
├─ "Parties must be on opposite sides"
│   └─ Prevention: side validation (ask vs bid)
│
├─ "Trade already executed"
│   └─ Prevention: executedTrades mapping
│
├─ "Invalid party signature"
│   └─ Prevention: ECDSA signature recovery
│
├─ "Invalid matching engine signature"
│   └─ Prevention: owner() verification
│
├─ "Insufficient locked balance"
│   └─ Prevention: lockedBalances check
│
└─ "Transfer failed"
    └─ Prevention: ERC20 transfer validation
```